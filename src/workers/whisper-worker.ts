/* eslint-env worker */
/* eslint-disable no-restricted-globals */
import { pipeline } from '@huggingface/transformers';
import { WorkerMessage, WorkerResponse } from '../types';

let transcriber: any = null;
let currentModel: string | null = null;
let lastLanguage: string | null = null;

self.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    
    try {
        if (message.type === "load-model") {
            console.log("🚀 Starting model loading:", message.model);
            currentModel = message.model || null;
            
            interface ModelCandidate {
                name: string;
                description: string;
                size: 'large' | 'turbo';
            }
            
            // 모델 후보 리스트 (큰 모델에서 작은 모델로 폴백)
            const modelCandidates: ModelCandidate[] = [
                ...(currentModel ? [{ name: currentModel, description: '요청된 모델', size: 'large' as const }] : []),
                { name: 'onnx-community/whisper-large-v3-turbo', description: '큰 모델', size: 'turbo' },
                { name: 'onnx-community/whisper-large-v3-turbo_timestamped', description: '기본 모델 ', size: 'turbo' }
            ];
            
            let modelLoaded = false;
            let lastError: Error | null = null;
            
            for (const model of modelCandidates) {
                if (modelLoaded) break;
                
                try {
                    console.log(`🔄 Attempting to load: ${model.description} (${model.name})`);
                    currentModel = model.name;
                    
                    const loadingMessage: WorkerResponse = {
                        type: 'loading',
                        status: 'downloading',
                        progress: 0,
                        message: `시도 중: ${model.description}`
                    };
                    self.postMessage(loadingMessage);
                    
                    // 타임아웃 설정 (모델 크기에 따라 조정)
                    const timeoutMs = model.size === 'large' ? 10 * 60 * 1000 : 5 * 60 * 1000; // 대형 모델 10분, 소형 모델 5분
                    
                    const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error(`타임아웃: ${model.description} 로딩이 ${timeoutMs/60000}분을 초과했습니다`)), timeoutMs);
                    });
                    
                    const loadModelPromise = tryLoadModel(model);
                    
                    // 타임아웃과 실제 로딩 레이스
                    const result = await Promise.race([loadModelPromise, timeoutPromise]);
                    
                    if (result && result.success && result.transcriber) {
                        console.log(`🎉 Successfully loaded ${model.description} using ${result.device}`);
                        transcriber = result.transcriber;
                        modelLoaded = true;
                        
                        // 최종 완료 메시지 - ready 상태로 변경
                        const readyMessage: WorkerResponse = { 
                            type: 'loading',
                            status: 'ready',
                            progress: 100,
                            message: `${model.description} 로딩 완료 (${result.device})`
                        };
                        self.postMessage(readyMessage);
                        
                        break;
                    } else {
                        throw new Error(`모델 로딩 결과가 올바르지 않습니다: ${JSON.stringify(result)}`);
                    }
                    
                } catch (modelError) {
                    const error = modelError instanceof Error ? modelError : new Error('알 수 없는 오류');
                    console.error(`❌ Failed to load ${model.description}:`, error.message);
                    lastError = error;
                    
                    if (model === modelCandidates[modelCandidates.length - 1]) {
                        throw new Error(`모든 모델 로딩 실패. 마지막 오류: ${error.message}`);
                    } else {
                        console.log(`🔄 Trying next smaller model...`);
                        continue;
                    }
                }
            }
            
            if (!modelLoaded) {
                throw new Error(`모든 모델 로딩에 실패했습니다. ${lastError?.message || '알 수 없는 오류'}`);
            }
            
        } else if (message.type === "transcribe") {
            // STT 요청
            if (!transcriber) {
                console.error("❌ Transcriber not available, current state:", {
                    transcriber,
                    currentModel
                });
                throw new Error("Transcriber not initialized. Please wait for model loading to complete.");
            }
            
            console.log("✅ Transcriber is ready, processing audio...");
            
            const audioData = message.data?.audioData;
            const options = message.data?.options;
            
            if (!audioData) {
                throw new Error("Audio data not provided");
            }
            
            console.log("🎵 Starting transcription, audio length:", audioData.length);
            
            const transcribingMessage: WorkerResponse = {
                type: 'transcribing',
                message: 'STT 처리 중...'
            };
            self.postMessage(transcribingMessage);
            
            const result = await transcribe({
                audio: audioData,
                model: currentModel || 'onnx-community/whisper-large-v3-turbo',
                subtask: options?.task || 'transcribe',
                language: options?.language,
                timestamp: options?.timestamp || Date.now(),
                options: {
                    return_timestamps: options?.return_timestamps || false
                }
            });
            
            if (result) {
                console.log("✅ Transcription completed:", result.text);
                const resultMessage: WorkerResponse = {
                    type: "result",
                    text: result.text,
                    timestamp: result.timestamp
                };
                self.postMessage(resultMessage);
            }
        }
    } catch (error) {
        console.error("💥 Worker error:", error);
        // 메시지에 포함된 timestamp 또는 옵션 내부 timestamp를 에러에 포함하여 상위 큐가 멈추지 않게 함
        const fallbackTimestamp = message?.data?.options?.timestamp;
        const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
        const errorMessage: WorkerResponse = {
            type: "error",
            message: errorMsg,
            timestamp: fallbackTimestamp
        };
        self.postMessage(errorMessage);
    }
});

interface ModelCandidate {
    name: string;
    description: string;
    size: 'large' | 'turbo';
}

interface LoadModelResult {
    success: boolean;
    transcriber: any;
    device: string;
}

async function tryLoadModel(model: ModelCandidate): Promise<LoadModelResult> {
    const startTime = Date.now();
    let progressCount = 0;
    let isCompleted = false;
    const maxCallbacks = 200; // 최대 콜백 수를 대폭 줄임
    
    // 강제 완료 타이머 (90초 후 강제 완료)
    const forceCompleteTimer = setTimeout(() => {
        if (!isCompleted) {
            console.log('⏰ 90초 타임아웃 - 강제 완료');
            isCompleted = true;
            const timeoutMessage: WorkerResponse = {
                type: 'loading',
                status: 'ready',
                progress: 100,
                message: `${model.description}: 타임아웃 완료`
            };
            self.postMessage(timeoutMessage);
        }
    }, 90 * 1000);
    
    const progress_callback = (data: any) => {
        // 이미 완료되었으면 완전히 무시
        if (isCompleted) {
            return;
        }
        
        progressCount++;
        const elapsed = Date.now() - startTime;
        
        // 콜백이 너무 많으면 강제 완료
        if (progressCount >= maxCallbacks) {
            console.log(`🛑 콜백 수 초과 (${maxCallbacks}) - 강제 완료`);
            isCompleted = true;
            clearTimeout(forceCompleteTimer);
            const forceCompleteMessage: WorkerResponse = {
                type: 'loading',
                status: 'ready',
                progress: 100,
                message: `${model.description}: 강제 완료`
            };
            self.postMessage(forceCompleteMessage);
            return;
        }
        
        // 로그는 10번마다만 출력
        if (progressCount % 10 === 0 || progressCount === 1) {
            console.log(`📊 Progress #${progressCount}/${maxCallbacks} (${elapsed}ms): ${data.status} - ${Math.round((data.progress || 0) * 100)}%`);
        }
        
        // UI 업데이트는 20번마다만 (부하 줄임)
        if (progressCount % 20 === 0 || progressCount === 1 || data.progress === 1.0) {
            let progress = Math.min(98, Math.round((data.progress || progressCount/maxCallbacks) * 100));
            
            const progressMessage: WorkerResponse = {
                type: 'loading',
                status: 'downloading',
                progress: progress,
                message: `${model.description}: ${progress}% (${Math.round(elapsed/1000)}초)`
            };
            self.postMessage(progressMessage);
        }
    };
    
    try {
        console.log("🔄 Trying WebGPU...");
        
        const transcriber = await pipeline("automatic-speech-recognition", model.name, {
            dtype: {
                encoder_model: "fp16",
                decoder_model_merged: "q4",
            },
            device: "webgpu",
            progress_callback
        });
        
        // 성공적으로 완료
        isCompleted = true;
        clearTimeout(forceCompleteTimer);
        console.log(`✅ WebGPU success in ${Date.now() - startTime}ms`);
        
        const webgpuCompleteMessage: WorkerResponse = {
            type: 'loading',
            status: 'ready',
            progress: 100,
            message: `${model.description}: WebGPU 완료!`
        };
        self.postMessage(webgpuCompleteMessage);
        
        return { success: true, transcriber, device: 'WebGPU' };
        
    } catch (webgpuError) {
        const error = webgpuError instanceof Error ? webgpuError : new Error('알 수 없는 오류');
        console.warn("❌ WebGPU failed:", error.message);
        
        try {
            console.log("🔄 Trying CPU fallback...");
            progressCount = 0; // 진행률 리셋
            
            const transcriber = await pipeline("automatic-speech-recognition", model.name, {
                dtype: {
                    encoder_model: "fp32",
                    decoder_model_merged: "fp32",
                },
                device: "cpu",
                progress_callback
            });
            
            // 성공적으로 완료
            isCompleted = true;
            clearTimeout(forceCompleteTimer);
            console.log(`✅ CPU success in ${Date.now() - startTime}ms`);
            
            const cpuCompleteMessage: WorkerResponse = {
                type: 'loading',
                status: 'ready',
                progress: 100,
                message: `${model.description}: CPU 완료!`
            };
            self.postMessage(cpuCompleteMessage);
            
            return { success: true, transcriber, device: 'CPU' };
            
        } catch (cpuError) {
            isCompleted = true;
            clearTimeout(forceCompleteTimer);
            console.error("❌ Both WebGPU and CPU failed");
            const error = cpuError instanceof Error ? cpuError : new Error('알 수 없는 오류');
            throw error;
        }
    }
}

interface TranscribeOptions {
    audio: Float32Array;
    model: string;
    subtask?: string;
    language?: string | null;
    timestamp: number;
    options?: {
        return_timestamps?: boolean;
    };
}

interface TranscribeResult {
    text: string;
    timestamp: number;
    chunks?: Array<{
        text: string;
        timestamp: [number, number];
    }> | null;
}

const transcribe = async ({ audio, model, subtask = "transcribe", language = null, timestamp, options }: TranscribeOptions): Promise<TranscribeResult> => {
    try {
        // audio가 Float32Array인지 확인
        if (!(audio instanceof Float32Array)) {
            console.log("🔄 Converting audio to Float32Array");
            audio = new Float32Array(audio);
        }

        // 오디오 데이터 유효성 검사
        if (audio.length === 0) {
            throw new Error("Audio data is empty");
        }

        console.log("🎵 Processing audio data, length:", audio.length, "language:", language);

        // 지정된 언어로 처리
        const lang = language === 'korean' ? 'ko' : language === 'english' ? 'en' : language;
        console.log("🎯 지정 언어로 처리:", lang);
        
        const result = await transcriber(audio, {
            task: subtask,
            language: lang,
            return_timestamps: options?.return_timestamps || false,
        });
        
        return {
            text: result.text?.trim() || '',
            timestamp: timestamp,
            chunks: result.chunks || null
        };
    } catch (error) {
        console.error("❌ Transcription error:", error);
        throw error;
    }
};