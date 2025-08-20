import { useState, useRef, useCallback, useEffect } from 'react';
import { MicVAD } from '@ricky0123/vad-web';
import { VADStatus } from './types';

interface UseVADRecordingReturn {
  isRecording: boolean;
  error: string | null;
  vadStatus: VADStatus;
  segmentCount: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

type OnAudioSegmentCallback = (audioBlob: Blob, timestamp: number) => Promise<void>;

export const useVADRecording = (onAudioSegment: OnAudioSegmentCallback): UseVADRecordingReturn => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [vadStatus, setVadStatus] = useState<VADStatus>('idle'); // idle, listening, speaking, processing
  
  const vadRef = useRef<any>(null); // MicVAD 타입이 복잡하므로 any 사용
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const segmentStartTimeRef = useRef<number>(0);
  const segmentCountRef = useRef<number>(0);

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

    // 스트림 정리
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    setVadStatus('idle');
    segmentCountRef.current = 0;
  }, []);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (vadRef.current) {
        vadRef.current.destroy();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    isRecording,
    error,
    vadStatus, // idle, listening, speaking, processing
    segmentCount: segmentCountRef.current,
    startRecording,
    stopRecording
  };
};