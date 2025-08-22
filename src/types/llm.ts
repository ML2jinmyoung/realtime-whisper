export interface SummaryRequest {
  transcriptText: string;
  language: 'korean' | 'english';
  email: string;
  meetingInfo?: {
    date: string;
    startTime: string;
    duration: string;
    segmentCount: number;
  };
}

export interface SummaryResponse {
  success: boolean;
  summary?: string;
  correctedTranscript?: string;
  error?: string;
  emailSent?: boolean;
}

export interface LLMService {
  summarizeAndEmail: (request: SummaryRequest) => Promise<SummaryResponse>;
}