import { useState, useRef, useCallback, useEffect } from 'react';
import { MicVAD } from '@ricky0123/vad-web';
import { VADStatus } from './types';

interface UseVADRecordingReturn {
  isRecording: boolean;
  error: string | null;
  vadStatus: VADStatus;
  segmentCount: number;
  audioLevel: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
}

type OnAudioSegmentCallback = (audioBlob: Blob, timestamp: number) => Promise<void>;

export const useVADRecording = (onAudioSegment: OnAudioSegmentCallback): UseVADRecordingReturn => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [vadStatus, setVadStatus] = useState<VADStatus>('idle'); // idle, listening, speaking, processing
  const [audioLevel, setAudioLevel] = useState<number>(0);
  
  const vadRef = useRef<any>(null); // MicVAD 타입이 복잡하므로 any 사용
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const segmentStartTimeRef = useRef<number>(0);
  const segmentCountRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 오디오 레벨 분석 시작 (성능 최적화 버전)
  const startAudioLevelAnalysis = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      // 성능 최적화: FFT 크기 감소, 스무딩 조정
      analyser.fftSize = 128; // 256에서 128로 감소 (계산 부하 절반)
      analyser.smoothingTimeConstant = 0.9; // 더 부드러운 변화
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateAudioLevel = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((acc, value) => acc + value, 0) / dataArray.length;
        const normalizedLevel = Math.min(100, (average / 128) * 100);
        const roundedLevel = Math.round(normalizedLevel);
        
        // 레벨이 실제로 변경된 경우만 상태 업데이트 (불필요한 리렌더링 방지)
        setAudioLevel(prev => prev !== roundedLevel ? roundedLevel : prev);
        
        // 60fps 대신 30fps로 제한하여 성능 향상
        setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }, 33); // ~30fps
      };
      
      updateAudioLevel();
      
    } catch (error) {
      console.error('오디오 레벨 분석 초기화 실패:', error);
    }
  }, []);

  // 오디오 레벨 분석 중지
  const stopAudioLevelAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // VAD 초기화
  const initializeVAD = useCallback(async (stream: MediaStream): Promise<void> => {
    try {
      console.log('VAD 초기화 중...');
      
      const vad = await MicVAD.new({
        onSpeechStart: () => {
          console.log('🎤 음성 시작 감지');
          setVadStatus('speaking');
          
          // 음성이 시작되면 녹음 시작
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'recording') {
            chunksRef.current = [];
            segmentStartTimeRef.current = Date.now();
            segmentCountRef.current++;
            
            console.log(`세그먼트 #${segmentCountRef.current} 녹음 시작`);
            mediaRecorderRef.current.start();
          }
        },
        
        onSpeechEnd: (audio: Float32Array) => {
          console.log('🔇 음성 종료 감지');
          setVadStatus('processing');
          
          // 음성이 끝나면 녹음 중지 및 STT 처리
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            console.log(`세그먼트 #${segmentCountRef.current} 녹음 종료`);
            mediaRecorderRef.current.stop();
          }
        },
        
        onVADMisfire: () => {
          console.log('⚠️ VAD 오탐지');
          setVadStatus('listening');
        },
        
        // VAD 설정
        positiveSpeechThreshold: 0.5,  // 음성 감지 민감도
        negativeSpeechThreshold: 0.35, // 음성 종료 민감도
        redemptionFrames: 8,           // 음성 복구 프레임
        frameSamples: 1536,            // 프레임 크기
        preSpeechPadFrames: 1,         // 음성 시작 전 패딩
        minSpeechFrames: 3,            // 최소 음성 프레임
        stream: stream
      });
      
      vadRef.current = vad;
      console.log('✅ VAD 초기화 완료');
      
    } catch (err) {
      console.error('VAD 초기화 실패:', err);
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setError('음성 감지 초기화 실패: ' + errorMessage);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setVadStatus('listening');
      segmentCountRef.current = 0;
      
      // 마이크 스트림 획득
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;
      
      // MediaRecorder 설정
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const segmentStartTime = segmentStartTimeRef.current;
          
          console.log(`세그먼트 #${segmentCountRef.current} STT 처리 요청`);
          
          // STT 처리
          await onAudioSegment(blob, segmentStartTime);
          
          chunksRef.current = [];
        }
        
        // STT 처리 완료 후 다시 대기 상태로
        setVadStatus('listening');
      };

      // VAD 초기화 및 시작
      await initializeVAD(stream);
      
      // 오디오 레벨 분석 시작
      startAudioLevelAnalysis(stream);
      
      // VAD 시작
      if (vadRef.current) {
        vadRef.current.start();
        console.log('🎧 VAD 리스닝 시작');
      }

      setIsRecording(true);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setError('녹음 시작 실패: ' + errorMessage);
      console.error('Error starting VAD recording:', err);
    }
  }, [onAudioSegment, initializeVAD]);

  const pauseRecording = useCallback(() => {
    // VAD 완전 중지 (destroy하고 재생성하지 않음)
    if (vadRef.current) {
      vadRef.current.pause();
      console.log('⏸️ VAD 완전 중지');
    }

    // 진행 중인 녹음이 있으면 중지
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    // 오디오 레벨 분석 완전 중지 (AudioContext도 일시정지)
    stopAudioLevelAnalysis();
    console.log('🔇 오디오 분석 중지');

    setVadStatus('idle');
  }, [stopAudioLevelAnalysis]);

  const resumeRecording = useCallback(() => {
    // VAD 재개
    if (vadRef.current) {
      vadRef.current.start();
      console.log('▶️ VAD 재개');
    }

    // 오디오 레벨 분석 재개 (스트림을 다시 연결)
    if (streamRef.current) {
      startAudioLevelAnalysis(streamRef.current);
      console.log('🎤 오디오 분석 재개');
    }

    setVadStatus('listening');
  }, [startAudioLevelAnalysis]);

  const stopRecording = useCallback(() => {
    // VAD 중지
    if (vadRef.current) {
      vadRef.current.pause();
      console.log('🛑 VAD 중지');
    }

    // 진행 중인 녹음이 있으면 중지
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    // 오디오 레벨 분석 완전 중지
    stopAudioLevelAnalysis();

    // 스트림 정리
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    setVadStatus('idle');
    segmentCountRef.current = 0;
  }, [stopAudioLevelAnalysis]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      stopAudioLevelAnalysis();
      if (vadRef.current) {
        vadRef.current.destroy();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [stopAudioLevelAnalysis]);

  return {
    isRecording,
    error,
    vadStatus, // idle, listening, speaking, processing
    segmentCount: segmentCountRef.current,
    audioLevel,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording
  };
};