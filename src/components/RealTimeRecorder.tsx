import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useVADRecording } from '../useVADRecording';
import { useWhisperSTT } from '../useWhisperSTT';
import { Transcript } from '../types';

interface RealTimeRecorderProps {
  currentLanguage: 'korean' | 'english';
  isModelReady: boolean;
  isModelLoading: boolean;
  sttError: string | null;
  onRecordingStateChange?: (state: { isRecording: boolean; isPaused: boolean }) => void;
}

export const RealTimeRecorder: React.FC<RealTimeRecorderProps> = ({ 
  currentLanguage, 
  isModelReady, 
  isModelLoading, 
  sttError,
  onRecordingStateChange
}) => {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  
  const processingCountRef = useRef<number>(0);
  const transcriptsEndRef = useRef<HTMLDivElement>(null);
  
  const {
    isProcessing,
    transcribeAudio
  } = useWhisperSTT();

  const handleAudioSegment = useCallback(async (audioBlob: Blob, segmentStartTime: number): Promise<void> => {
    if (!isModelReady) {
      console.warn('⚠️ 모델이 아직 준비되지 않았습니다. 현재 상태:', {
        isModelLoading,
        isModelReady,
        error: sttError
      });
      
      // 에러 transcript 추가
      const segmentNumber = processingCountRef.current + 1;
      processingCountRef.current++;
      
      setTranscripts(prev => {
        const errorTranscript = {
          id: segmentStartTime,
          text: '[모델 로딩 중... 잠시 후 다시 시도해주세요]',
          timestamp: segmentStartTime,
          segmentNumber: segmentNumber,
          processedAt: Date.now(),
          recordingStartTime: recordingStartTime,
          isError: true
        };
        
        return [...prev, errorTranscript].sort((a, b) => a.timestamp - b.timestamp);
      });
      return;
    }

    const segmentNumber = processingCountRef.current + 1;
    
    console.log(`음성 세그먼트 ${segmentNumber} 처리 시작`);
    
    try {
      processingCountRef.current++;
      
      console.log(`🌐 STT 처리 - 언어: ${currentLanguage}, 세그먼트: ${segmentNumber}`);
      const result = await transcribeAudio(audioBlob, segmentStartTime, currentLanguage);
      
      setTranscripts(prev => {
        const newTranscript = {
          id: segmentStartTime,
          text: result.text,
          timestamp: segmentStartTime,
          segmentNumber: segmentNumber,
          processedAt: Date.now(),
          recordingStartTime: recordingStartTime
        };
        
        console.log('📝 New transcript:', newTranscript);
        
        return [...prev, newTranscript].sort((a, b) => a.timestamp - b.timestamp);
      });
      
      console.log(`음성 세그먼트 ${segmentNumber} 처리 완료:`, result.text);
      
    } catch (error) {
      console.error(`음성 세그먼트 ${segmentNumber} 처리 실패:`, error);
      
      setTranscripts(prev => {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
        const errorTranscript = {
          id: segmentStartTime,
          text: `[처리 오류: ${errorMessage}]`,
          timestamp: segmentStartTime,
          segmentNumber: segmentNumber,
          processedAt: Date.now(),
          recordingStartTime: recordingStartTime,
          isError: true
        };
        
        return [...prev, errorTranscript].sort((a, b) => a.timestamp - b.timestamp);
      });
    }
  }, [isModelReady, transcribeAudio, recordingStartTime, currentLanguage, isModelLoading, sttError]);

  const {
    isRecording,
    error: recordingError,
    segmentCount,
    audioLevel,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording
  } = useVADRecording(handleAudioSegment);

  const handleStartRecording = useCallback(async () => {
    console.log('🎬 녹음 시작 요청, 현재 모델 상태:', {
      isModelLoading,
      isModelReady,
      error: sttError
    });
    
    if (!isModelReady) {
      alert(`모델이 아직 준비되지 않았습니다.\n상태: ${isModelLoading ? '로딩 중...' : '준비 중'}\n${sttError ? `오류: ${sttError}` : ''}`);
      return;
    }
    
    setTranscripts([]);
    processingCountRef.current = 0;
    setRecordingStartTime(Date.now());
    await startRecording();
    setIsPaused(false);
    onRecordingStateChange?.({ isRecording: true, isPaused: false });
  }, [isModelReady, isModelLoading, sttError, startRecording, onRecordingStateChange]);

  const handlePauseRecording = useCallback(() => {
    pauseRecording();
    setIsPaused(true);
    onRecordingStateChange?.({ isRecording: true, isPaused: true });
    console.log('⏸️ 녹음 일시정지');
  }, [pauseRecording, onRecordingStateChange]);

  const handleResumeRecording = useCallback(() => {
    resumeRecording();
    setIsPaused(false);
    onRecordingStateChange?.({ isRecording: true, isPaused: false });
    console.log('▶️ 녹음 재개');
  }, [resumeRecording, onRecordingStateChange]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    setRecordingStartTime(null);
    setIsPaused(false);
    processingCountRef.current = 0;
    onRecordingStateChange?.({ isRecording: false, isPaused: false });
    console.log('⏹️ 녹음 종료');
  }, [stopRecording, onRecordingStateChange]);

  // 자동 스크롤 기능
  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const formatElapsedTime = useCallback((timestamp: number, startTime: number | null): string => {
    if (!startTime) {
      // startTime이 없으면 절대 시간 표시
      return new Date(timestamp).toLocaleTimeString('ko-KR');
    }
    const elapsed = Math.floor((timestamp - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const downloadAsText = useCallback(() => {
    if (transcripts.length === 0) {
      alert('다운로드할 회의록이 없습니다.');
      return;
    }

    const meetingDate = new Date().toLocaleDateString('ko-KR');
    const meetingTime = recordingStartTime ? new Date(recordingStartTime).toLocaleTimeString('ko-KR') : '';
    
    let content = `회의록 (실시간 모드)\n`;
    content += `날짜: ${meetingDate}\n`;
    content += `시작 시간: ${meetingTime}\n`;
    content += `총 음성 세그먼트: ${transcripts.length}개\n`;
    content += `VAD 기반 음성 감지\n\n`;
    content += `${'='.repeat(50)}\n\n`;

    // 타임스탬프 순으로 정렬
    const sortedTranscripts = [...transcripts].sort((a, b) => a.timestamp - b.timestamp);
    
    sortedTranscripts.forEach((transcript) => {
      const elapsedTime = formatElapsedTime(transcript.timestamp, transcript.recordingStartTime);
      const actualTime = new Date(transcript.timestamp).toLocaleTimeString('ko-KR');
      content += `[${elapsedTime}] (${actualTime})\n`;
      content += `${transcript.text || '(텍스트가 비어있습니다)'}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `실시간회의록_${meetingDate.replace(/\./g, '')}_${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [transcripts, recordingStartTime, formatElapsedTime]);

  return (
    <div className="space-y-6">
      {/* 녹음 컨트롤 섹션 - 강조 (다크) */}
      <div className="bg-gray-900 text-gray-100 rounded-xl shadow-sm border border-gray-800 p-8">
        <div className="flex flex-col items-center gap-8">
          {/* 녹음 버튼들 - 더 큰 크기로 강조 */}
          <div className="flex items-center justify-center gap-6">
            {!isRecording ? (
              <div className="flex flex-col items-center gap-2">
                <button
                  aria-label="녹음 시작"
                  className={`w-16 h-16 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group ${
                    isModelReady 
                      ? 'bg-red-500 hover:bg-red-600' 
                      : 'bg-gray-600 cursor-not-allowed'
                  }`}
                  onClick={handleStartRecording}
                  disabled={!isModelReady}
                >
                  <div className={`w-5 h-5 rounded-full group-hover:scale-110 transition-transform ${
                    isModelReady ? 'bg-white' : 'bg-gray-300'
                  }`}></div>
                </button>
                <span className={`text-sm ${isModelReady ? 'text-white' : 'text-gray-400'}`}>녹음 시작</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <button
                    aria-label={isPaused ? '녹음 재개' : '녹음 일시정지'}
                    className={`w-16 h-16 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group ${
                      isPaused 
                        ? 'bg-green-500 hover:bg-green-600' 
                        : 'bg-yellow-500 hover:bg-yellow-600'
                    }`}
                    onClick={isPaused ? handleResumeRecording : handlePauseRecording}
                  >
                    {isPaused ? (
                      <div className="w-0 h-0 border-l-[10px] border-l-white border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1 group-hover:scale-110 transition-transform"></div>
                    ) : (
                      <div className="flex gap-1.5">
                        <div className="w-2 h-6 bg-white rounded-sm"></div>
                        <div className="w-2 h-6 bg-white rounded-sm"></div>
                      </div>
                    )}
                  </button>
                  <span className="text-sm text-white">{isPaused ? '녹음 재개' : '녹음 일시정지'}</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button
                    aria-label="종료"
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center relative group"
                    onClick={handleStopRecording}
                  >
                    <div className="w-5 h-5 bg-white rounded-sm group-hover:scale-110 transition-transform"></div>
                    {isRecording && !isPaused && (
                      <div className="absolute -top-2 -right-2 w-4 h-4 bg-red-400 rounded-full animate-pulse"></div>
                    )}
                  </button>
                  <span className="text-sm text-white">종료</span>
                </div>
              </div>
            )}
          </div>

          {/* 모델 준비 상태 안내 */}
          {!isModelReady && (
            <div className="text-center">
              <p className="text-sm text-gray-300 mb-2">
                {isModelLoading ? '모델 로딩 중...' : '모델 준비 중...'}
              </p>
              {sttError && (
                <p className="text-sm text-red-400">
                  오류: {sttError}
                </p>
              )}
            </div>
          )}

          {/* 음량 체크 - 강조 */}
          {isRecording && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-4 text-sm text-gray-300">
                <div className="flex items-center gap-2">
                  <span className="text-gray-300">🎤</span>
                  <span>음성 감지: <span className="font-semibold text-white">{segmentCount}개</span></span>
                </div>
              </div>
              
              {/* 음량 바 - 더 시각적으로 강조 */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">음량</span>
                <div className="flex items-end gap-1 h-8">
                  {[...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 volume-bar rounded-sm ${
                        audioLevel > (i * 10) 
                          ? i < 3 ? 'bg-green-500' : i < 7 ? 'bg-yellow-500' : 'bg-red-500'
                          : 'bg-gray-600'
                      }`}
                      style={{ height: `${Math.max(6, (i + 1) * 2.5)}px` }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 다운로드 섹션 - 심플하게 */}
      {transcripts.length > 0 && !isRecording && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">회의록 다운로드</h3>
            <span className="text-sm text-gray-500">{transcripts.length}개 세그먼트</span>
          </div>
          <button 
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 hover:-translate-y-0.5 shadow-sm"
            onClick={downloadAsText}
          >
            📄 TXT 다운로드
          </button>
        </div>
      )}

      {/* 오류 표시 */}
      {(sttError || recordingError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <span className="font-medium">오류:</span> {sttError || recordingError}
        </div>
      )}

      {/* STT 결과 - 간단하게 유지 */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">회의 내용</h3>
        
        <div className="max-h-96 overflow-y-auto">
          {transcripts.length === 0 && !isRecording && (
            <p className="text-gray-500 italic text-center py-8">
              녹음 버튼을 눌러 실시간 회의를 시작하세요.
            </p>
          )}

          {isRecording && transcripts.length === 0 && (
            <p className="text-gray-500 italic text-center py-8">
              음성 감지 대기 중... 말씀하시면 실시간으로 텍스트가 나타납니다.
            </p>
          )}

          <div className="text-gray-800 leading-relaxed space-y-2">
            {transcripts.map((transcript) => (
              <div key={transcript.id} className="py-2 border-b border-gray-100 last:border-b-0">
                <span className="text-xs text-gray-500 mr-3">
                  [{formatElapsedTime(transcript.timestamp, transcript.recordingStartTime)}]
                </span>
                <span className={transcript.isError ? 'text-red-600 italic' : ''}>
                  {transcript.text || '(텍스트가 비어있습니다)'}
                </span>
              </div>
            ))}
            <div ref={transcriptsEndRef} />
          </div>
          
          {isRecording && isProcessing && (
            <div className="flex items-center gap-2 text-sm text-yellow-700 mt-4">
              <div className="spinner"></div>
              STT 처리 중...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};