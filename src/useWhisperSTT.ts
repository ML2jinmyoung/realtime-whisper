import { useState, useRef, useCallback, useEffect } from 'react';
import { STTResult, ModelInfo, WorkerMessage, WorkerResponse } from './types';

interface UseWhisperSTTReturn {
  isModelLoading: boolean;
  isModelReady: boolean;
  isProcessing: boolean;
  error: string | null;
  loadingProgress: number;
  modelInfo: ModelInfo | null;
  transcribeAudio: (audioBlob: Blob, timestamp: number, language?: string, returnTimestamps?: boolean) => Promise<STTResult>;
  initializeModel: () => Promise<void>;
  clearQueue: () => void;
  waitForQueueCompletion: () => Promise<void>;
  getQueueLength: () => number;
}

interface QueueItem {
  audioBlob: Blob;
  timestamp: number;
  language: string;
  returnTimestamps: boolean;
  resolve: (result: STTResult) => void;
  reject: (error: Error) => void;
}

export const useWhisperSTT = (): UseWhisperSTTReturn => {
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const processingQueueRef = useRef<QueueItem[]>([]);
  const isProcessingRef = useRef(false);

  const initializeModel = useCallback(async () => {
    if (workerRef.current || isModelLoading) return;
    
    try {
      setIsModelLoading(true);
      setError(null);
      setLoadingProgress(0);
      
      console.log('Web Worker와 Whisper Turbo 모델 초기화 중...');
      
      // Web Worker 생성 - npm으로 설치된 transformers.js 사용
      const worker = new Worker(new URL('./workers/whisper-worker.ts', import.meta.url), {
        type: 'module'
      });
      
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { type, status, message, progress, text, timestamp } = e.data;
        
        switch (type) {
          case 'loading':
            if (status === 'downloading') {
              setLoadingProgress(progress || 0);
              console.log(message);
            } else if (status === 'ready') {
              setIsModelReady(true);
              setIsModelLoading(false);
              setLoadingProgress(100);
              setModelInfo({ description: 'Whisper Large V3 Turbo' });
              console.log(message);
            }
            break;
            
          case 'transcribing':
            setIsProcessing(true);
            console.log(message);
            break;
            
          case 'result':
            if (text !== undefined && timestamp !== undefined) {
              handleTranscriptionResult({ text, timestamp });
            }
            break;
            
          case 'error':
            console.error('Worker error:', message);
            if (timestamp) {
              handleTranscriptionError(new Error(message || '알 수 없는 오류'), timestamp);
            } else {
              setError(message || '알 수 없는 오류');
              setIsModelLoading(false);
            }
            break;
          default:
            // ignore unknown message types
            break;
        }
      };

      worker.onerror = (error: ErrorEvent) => {
        console.error('Worker error details:', {
          message: error.message,
          filename: error.filename,
          lineno: error.lineno,
          colno: error.colno,
          error: error.error
        });
        setError(`Web Worker 오류: ${error.message} (in ${error.filename}:${error.lineno})`);
        setIsModelLoading(false);
      };
      
      workerRef.current = worker;
      
      // Whisper Turbo 모델 로드 요청
      const loadMessage: WorkerMessage = {
        type: 'load-model',
        model: 'onnx-community/whisper-large-v3-turbo_timestamped'
      };
      worker.postMessage(loadMessage);
      
    } catch (err) {
      console.error('Worker 초기화 실패:', err);
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setError('Worker 초기화 실패: ' + errorMessage);
      setIsModelLoading(false);
    }
  }, []);

  const audioBufferFromBlob = useCallback(async (blob: Blob): Promise<Float32Array> => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    let audioData;
    if (audioBuffer.numberOfChannels === 1) {
      audioData = audioBuffer.getChannelData(0);
    } else {
      const leftChannel = audioBuffer.getChannelData(0);
      const rightChannel = audioBuffer.getChannelData(1);
      audioData = new Float32Array(leftChannel.length);
      for (let i = 0; i < leftChannel.length; i++) {
        audioData[i] = (leftChannel[i] + rightChannel[i]) / 2;
      }
    }
    
    if (audioBuffer.sampleRate !== 16000) {
      const resampledLength = Math.round(audioData.length * 16000 / audioBuffer.sampleRate);
      const resampledData = new Float32Array(resampledLength);
      const ratio = audioData.length / resampledLength;
      
      for (let i = 0; i < resampledLength; i++) {
        const srcIndex = Math.round(i * ratio);
        resampledData[i] = audioData[Math.min(srcIndex, audioData.length - 1)];
      }
      
      audioData = resampledData;
    }
    
    await audioContext.close();
    return audioData;
  }, []);

  const processAudioQueue = useCallback(async () => {
    if (isProcessingRef.current || processingQueueRef.current.length === 0 || !workerRef.current) {
      return;
    }

    isProcessingRef.current = true;
    setIsProcessing(true);

    while (processingQueueRef.current.length > 0 && workerRef.current) {
      const queueItem = processingQueueRef.current[0];
      const { audioBlob, timestamp, language, returnTimestamps, resolve, reject } = queueItem;

      try {
        console.log('STT 처리 시작:', new Date(timestamp).toLocaleTimeString());
        
        const audioData = await audioBufferFromBlob(audioBlob);
        
        if (audioData.length === 0) {
          resolve({ text: '', timestamp });
          processingQueueRef.current.shift();
          continue;
        }

        // Worker로 transcription 요청 전송
        const transcribeMessage: WorkerMessage = {
          type: 'transcribe',
          data: {
            audioData: audioData,
            options: {
              language: language,
              task: 'transcribe',
              chunk_length_s: 30,
              stride_length_s: 5,
              return_timestamps: returnTimestamps,
              timestamp: timestamp
            }
          }
        };
        workerRef.current.postMessage(transcribeMessage);

        break; // Worker에서 결과를 기다리기 위해 루프 중단
        
      } catch (err) {
        console.error('STT 처리 오류:', err);
        const error = err instanceof Error ? err : new Error('알 수 없는 오류');
        reject(error);
        processingQueueRef.current.shift();
      }
    }

    if (processingQueueRef.current.length === 0) {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [audioBufferFromBlob]);

  const handleTranscriptionResult = useCallback(({ text, timestamp }: { text: string; timestamp: number }) => {
    const queueItem = processingQueueRef.current.find(item => item.timestamp === timestamp);
    if (queueItem) {
      queueItem.resolve({ text, timestamp });
      processingQueueRef.current = processingQueueRef.current.filter(item => item.timestamp !== timestamp);
    }
    
    // 현재 아이템 처리가 끝났으므로 다음 아이템 처리를 위해 플래그를 해제
    isProcessingRef.current = false;
    
    if (processingQueueRef.current.length === 0) {
      setIsProcessing(false);
    } else {
      // 남은 항목이 있으면 즉시 다음 항목 처리
      processAudioQueue();
    }
  }, [processAudioQueue]);

  const handleTranscriptionError = useCallback((error: Error, timestamp: number) => {
    const queueItem = processingQueueRef.current.find(item => item.timestamp === timestamp);
    if (queueItem) {
      queueItem.reject(error);
      processingQueueRef.current = processingQueueRef.current.filter(item => item.timestamp !== timestamp);
    }
    
    // 에러 발생 시에도 다음 작업을 진행할 수 있도록 플래그 해제
    isProcessingRef.current = false;
    
    if (processingQueueRef.current.length === 0) {
      setIsProcessing(false);
    } else {
      processAudioQueue();
    }
  }, [processAudioQueue]);

  const getQueueLength = useCallback(() => {
    return processingQueueRef.current.length;
  }, []);

  const waitForQueueCompletion = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const checkQueue = () => {
        if (processingQueueRef.current.length === 0 && !isProcessingRef.current) {
          console.log('✅ STT 큐 완료 대기 종료');
          resolve();
        } else {
          console.log('⏳ STT 큐 대기 중:', processingQueueRef.current.length, '개 항목 남음');
          setTimeout(checkQueue, 100);
        }
      };
      checkQueue();
    });
  }, []);

  const clearQueue = useCallback(() => {
    console.log('🧹 STT 큐 클리어:', processingQueueRef.current.length, '개 항목 제거');
    
    // 대기 중인 모든 요청을 거부
    processingQueueRef.current.forEach(item => {
      item.reject(new Error('언어 변경으로 인한 큐 클리어'));
    });
    
    // 큐 비우기
    processingQueueRef.current = [];
    
    // 처리 상태 초기화
    isProcessingRef.current = false;
    setIsProcessing(false);
  }, []);

  const transcribeAudio = useCallback(async (audioBlob: Blob, timestamp: number, language: string = 'korean', returnTimestamps: boolean = false): Promise<STTResult> => {
    if (!workerRef.current || !isModelReady) {
      throw new Error('모델이 아직 로딩되지 않았습니다');
    }

    return new Promise<STTResult>((resolve, reject) => {
      processingQueueRef.current.push({
        audioBlob,
        timestamp,
        language,
        returnTimestamps,
        resolve,
        reject
      });
      
      processAudioQueue();
    });
  }, [processAudioQueue, isModelReady]);

  useEffect(() => {
    initializeModel();
    
    // cleanup: component unmount 시 worker 정리
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [initializeModel]);

  return {
    isModelLoading,
    isModelReady,
    isProcessing,
    error,
    loadingProgress,
    modelInfo,
    transcribeAudio,
    initializeModel,
    clearQueue,
    waitForQueueCompletion,
    getQueueLength
  };
};