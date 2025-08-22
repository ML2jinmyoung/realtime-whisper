import { useState, useCallback } from 'react';
import { LLMService } from '../services/llmService';
import { SummaryRequest, SummaryResponse } from '../types/llm';

interface UseLLMSummaryReturn {
  isProcessing: boolean;
  error: string | null;
  lastSummary: SummaryResponse | null;
  summarizeAndEmail: (request: SummaryRequest) => Promise<SummaryResponse>;
  clearError: () => void;
}

export const useLLMSummary = (): UseLLMSummaryReturn => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<SummaryResponse | null>(null);

  const summarizeAndEmail = useCallback(async (request: SummaryRequest): Promise<SummaryResponse> => {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await LLMService.summarizeAndEmail(request);
      
      if (result.success) {
        setLastSummary(result);
        setError(null);
      } else {
        setError(result.error || '요약 처리 실패');
      }

      return result;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isProcessing,
    error,
    lastSummary,
    summarizeAndEmail,
    clearError
  };
};