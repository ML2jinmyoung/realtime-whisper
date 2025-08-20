import React, { useState, useCallback, useRef } from 'react';
import { useVADRecording } from './useVADRecording';
import { useWhisperSTT } from './useWhisperSTT';
import { Transcript } from './types';
import './index.css';

function App(): JSX.Element {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [currentLanguage, setCurrentLanguage] = useState<'korean' | 'english'>('korean');
  
  const processingCountRef = useRef<number>(0);
  
  const {
    isModelLoading,
    isModelReady,
    isProcessing,
    error: sttError,
    loadingProgress,
    modelInfo,
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
  }, [isModelReady, transcribeAudio, recordingStartTime]);

  const {
    isRecording,
    error: recordingError,
    vadStatus,
    segmentCount,
    startRecording,
    stopRecording
  } = useVADRecording(handleAudioSegment);

  const handleStartRecording = useCallback(async () => {
    console.log('🎬 녹음 시작 요청, 현재 모델 상태:', {
      isModelLoading,
      isModelReady,
      error: sttError,
      modelInfo
    });
    
    if (!isModelReady) {
      alert(`모델이 아직 준비되지 않았습니다.\n상태: ${isModelLoading ? '로딩 중...' : '준비 중'}\n${sttError ? `오류: ${sttError}` : ''}`);
      return;
    }
    
    setTranscripts([]);
    processingCountRef.current = 0;
    setRecordingStartTime(Date.now());
    await startRecording();
  }, [isModelReady, startRecording]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    setRecordingStartTime(null);
    processingCountRef.current = 0;
  }, [stopRecording]);

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
    
    let content = `회의록\n`;
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
    link.download = `회의록_${meetingDate.replace(/\./g, '')}_${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [transcripts, recordingStartTime, formatElapsedTime]);


  const getStatusText = () => {
    if (!isModelReady) {
      if (isModelLoading) {
        return `Whisper 모델 로딩 중... ${loadingProgress}%`;
      }
      if (sttError) return `❌ 모델 오류: ${sttError}`;
      return '⏳ 모델 준비 중...';
    }
    
    if (isRecording) {
      switch (vadStatus) {
        case 'listening':
          return '🎧 음성 대기 중...';
        case 'speaking':
          return '🎤 음성 녹음 중...';
        case 'processing':
          return '⚙️ STT 처리 중...';
        default:
          return '녹음 중...';
      }
    }
    
    if (isProcessing) return 'STT 처리 중...';
    return `준비 완료 (${modelInfo?.description || 'Whisper'})`;
  };


  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 text-center">
        회의록 STT 앱 (VAD 기반)
      </h1>
      
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <button
          className={`px-6 py-3 rounded-lg font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-green-500 hover:bg-green-600'
          }`}
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={!isModelReady && !sttError}
        >
          {isRecording ? '녹음 중지' : '녹음 시작'}
        </button>
        
        {isRecording && (
          <div className="text-sm text-gray-600">
            감지된 음성: <span className="font-medium text-blue-600">{segmentCount}개</span>
          </div>
        )}
        
        {isRecording && (
          <button
            onClick={() => {
              const newLang = currentLanguage === 'korean' ? 'english' : 'korean';
              setCurrentLanguage(newLang);
              console.log('🔄 언어 변경:', currentLanguage, '→', newLang);
            }}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 border-2 ${
              currentLanguage === 'korean' 
                ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-600' 
                : 'bg-green-500 hover:bg-green-600 text-white border-green-600'
            }`}
            title="클릭하여 언어 전환"
          >
            {currentLanguage === 'korean' ? '🇰🇷 한국어' : '🇺🇸 English'}
          </button>
        )}
        
        <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
          !isModelReady || sttError || recordingError ? 'bg-gray-100 text-gray-600' :
          isRecording ? 'bg-red-100 text-red-700' :
          isProcessing ? 'bg-yellow-100 text-yellow-700' :
          'bg-green-100 text-green-700'
        }`}>
          {isModelLoading && <div className="spinner"></div>}
          {getStatusText()}
        </div>
      </div>

      {/* 다운로드 섹션 */}
      {transcripts.length > 0 && !isRecording && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">회의록 다운로드</h3>
          <div className="flex flex-wrap gap-3 mb-4">
            <button 
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:-translate-y-0.5"
              onClick={downloadAsText}
              title="텍스트 파일로 다운로드"
            >
              📄 TXT 다운로드
            </button>
          </div>
          <div className="text-sm text-gray-600 flex flex-wrap items-center gap-1">
            <span>총 {transcripts.length}개 음성 세그먼트</span>
            <span className="text-gray-400">•</span>
            <span>VAD 기반 자동 감지</span>
            <span className="text-gray-400">•</span>
            <span>모델: {modelInfo?.description || 'Unknown'}</span>
          </div>
        </div>
      )}

      {(sttError || recordingError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          <span className="font-medium">오류:</span> {sttError || recordingError}
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">회의 내용</h2>
        
        <div className="max-h-96 overflow-y-auto">
          {transcripts.length === 0 && !isRecording && (
            <p className="text-gray-500 italic text-center py-8">
              녹음 버튼을 눌러 회의를 시작하세요.
            </p>
          )}

          {isRecording && transcripts.length === 0 && (
            <p className="text-gray-500 italic text-center py-8">
              음성 감지 대기 중... 말씀하시면 자동으로 녹음됩니다.
            </p>
          )}

          <div className="text-gray-800 leading-relaxed">
            {transcripts.map((transcript) => (
              <div key={transcript.id} className="mb-2">
                <span className="text-xs text-gray-500 mr-2">
                  [{formatElapsedTime(transcript.timestamp, transcript.recordingStartTime)}]
                </span>
                <span className={transcript.isError ? 'text-red-600 italic' : ''}>
                  {transcript.text || '(텍스트가 비어있습니다)'}
                </span>
              </div>
            ))}
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
}

export default App;