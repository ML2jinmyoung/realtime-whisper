// 트랜스크립트 관련 타입
export interface Transcript {
  id: number;
  text: string;
  timestamp: number;
  segmentNumber: number;
  processedAt: number;
  recordingStartTime: number | null;
  isError?: boolean;
}

// 모델 정보 타입
export interface ModelInfo {
  description?: string;
  device?: string;
}

// VAD 상태 타입
export type VADStatus = 'idle' | 'listening' | 'speaking' | 'processing';

// STT 결과 타입
export interface STTResult {
  text: string;
  timestamp: number;
}

// Web Worker 메시지 타입
export interface WorkerMessage {
  type: 'load-model' | 'transcribe';
  model?: string;
  data?: {
    audioData: Float32Array;
    options: {
      language: string  | null;
      task: string;
      chunk_length_s?: number;
      stride_length_s?: number;
      return_timestamps?: boolean;
      timestamp: number;
    };
  };
}

export interface WorkerResponse {
  type: 'loading' | 'transcribing' | 'result' | 'error';
  status?: string;
  message?: string;
  progress?: number;
  text?: string;
  timestamp?: number;
}

// 다운로드용 JSON 데이터 타입
export interface DownloadData {
  metadata: {
    title: string;
    date: string;
    startTime: string;
    recordingStartTimestamp: number;
    totalSegments: number;
    vadBased: boolean;
    modelInfo?: ModelInfo;
    exportedAt: string;
  };
  segments: Array<{
    segmentNumber: number;
    elapsedTime: string;
    text: string;
    isEmpty: boolean;
    isError: boolean;
    timestamp: number;
    processedAt: number;
    processingTime: string | null;
  }>;
  summary: {
    totalDurationSeconds: number;
    segmentsWithText: number;
    segmentsEmpty: number;
    segmentsWithErrors: number;
  };
}