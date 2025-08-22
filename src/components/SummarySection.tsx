import React, { useState, useCallback } from 'react';
import { useLLMSummary } from '../hooks/useLLMSummary';
import { Transcript } from '../types';

export interface TimestampedSegment {
  text: string;
  start: number;
  end: number;
}

interface SummarySectionProps {
  transcripts: Transcript[];
  timestampedSegments?: TimestampedSegment[];
  currentLanguage: 'korean' | 'english';
  meetingInfo?: {
    date: string;
    startTime: string;
    duration: string;
    segmentCount: number;
  };
  mode: 'realtime' | 'batch';
  onDownloadTxt?: () => void;
}

export const SummarySection: React.FC<SummarySectionProps> = ({
  transcripts,
  timestampedSegments,
  currentLanguage,
  meetingInfo,
  mode,
  onDownloadTxt
}) => {
  const [email, setEmail] = useState('');
  const [showSummaryForm, setShowSummaryForm] = useState(false);
  const { isProcessing, error, lastSummary, summarizeAndEmail, clearError } = useLLMSummary();

  const formatTranscriptText = useCallback(() => {
    if (mode === 'batch' && timestampedSegments && timestampedSegments.length > 0) {
      // 배치 모드: 타임스탬프가 있는 경우
      return timestampedSegments
        .map(segment => {
          const startTime = Math.floor(segment.start / 60) + ':' + 
                           Math.floor(segment.start % 60).toString().padStart(2, '0');
          const endTime = Math.floor(segment.end / 60) + ':' + 
                         Math.floor(segment.end % 60).toString().padStart(2, '0');
          return `[${startTime} - ${endTime}] ${segment.text}`;
        })
        .join('\n\n');
    } else {
      // 실시간 모드 또는 타임스탬프가 없는 경우
      const sortedTranscripts = [...transcripts].sort((a, b) => a.timestamp - b.timestamp);
      return sortedTranscripts
        .map(transcript => transcript.text)
        .filter(text => text && text.trim().length > 0)
        .join('\n\n');
    }
  }, [transcripts, timestampedSegments, mode]);

  const handleSummarize = useCallback(async () => {
    if (!email.trim()) {
      alert('메일 주소를 입력해주세요.');
      return;
    }

    if (!email.includes('@')) {
      alert('올바른 메일 주소를 입력해주세요.');
      return;
    }

    const transcriptText = formatTranscriptText();
    if (!transcriptText.trim()) {
      alert('요약할 회의 내용이 없습니다.');
      return;
    }

    clearError();

    try {
      const result = await summarizeAndEmail({
        transcriptText,
        language: currentLanguage,
        email: email.trim(),
        meetingInfo
      });

      if (result.success) {
        alert(`✅ 요약이 완료되어 ${email}로 메일이 발송되었습니다!`);
        setShowSummaryForm(false);
      } else {
        alert(`❌ 요약 실패: ${result.error}`);
      }
    } catch (err) {
      console.error('요약 처리 오류:', err);
      alert('요약 처리 중 오류가 발생했습니다.');
    }
  }, [email, formatTranscriptText, currentLanguage, meetingInfo, summarizeAndEmail, clearError]);

  if (transcripts.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">📋 회의록 처리</h3>
        <span className="text-sm text-gray-500">
          다운로드 및 AI 요약
        </span>
      </div>

      {/* 다운로드 및 요약 버튼 */}
      <div className="flex gap-3 mb-6">
        {onDownloadTxt && (
          <button
            onClick={onDownloadTxt}
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 hover:-translate-y-0.5 shadow-sm flex items-center gap-2"
          >
            <span>📄</span>
            <span>TXT 다운로드</span>
          </button>
        )}
        
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 hover:-translate-y-0.5 shadow-sm flex items-center gap-2"
          onClick={() => setShowSummaryForm(true)}
          disabled={isProcessing || showSummaryForm}
        >
          <span>🤖</span>
          <span>AI 요약하고 메일로 받기</span>
        </button>
      </div>

      {showSummaryForm && (
        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              메일 주소
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isProcessing}
            />
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">
              <strong>요약 내용:</strong>
            </p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• STT 결과 오류 보정</li>
              <li>• 주요 논의 사항 정리</li>
              <li>• 결정된 사항 요약</li>
              <li>• 액션 아이템 정리</li>
              <li>• 후속 조치 사항</li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <span className="font-medium">오류:</span> {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSummarize}
              disabled={isProcessing || !email.trim()}
              className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                isProcessing || !email.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white hover:-translate-y-0.5 shadow-sm'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="spinner"></div>
                  <span>처리 중...</span>
                </>
              ) : (
                <>
                  <span>📧</span>
                  <span>메일 발송</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setShowSummaryForm(false);
                clearError();
              }}
              disabled={isProcessing}
              className="px-6 py-3 rounded-lg font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-all duration-200"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
};