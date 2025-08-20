import React, { useState, useCallback, useRef } from 'react';
import { useVADRecording } from './useVADRecording';
import { useWhisperSTT } from './useWhisperSTT';
import './index.css';

function App() {
  const [transcripts, setTranscripts] = useState([]);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  https://chatbot.kct.co.kr/database
  const processingCountRef = useRef(0);
  
  const {
    isModelLoading,
    isModelReady,
    isProcessing,
    error: sttError,
    loadingProgress,
    modelInfo,
    transcribeAudio
  } = useWhisperSTT();

  const handleAudioSegment = useCallback(async (audioBlob, segmentStartTime) => {
    if (!isModelReady) {
      console.warn('모델이 아직 준비되지 않았습니다');
      return;
    }

    const segmentNumber = processingCountRef.current + 1;
    
    console.log(`음성 세그먼트 ${segmentNumber} 처리 시작`);
    
    try {
      processingCountRef.current++;
      
      const result = await transcribeAudio(audioBlob, segmentStartTime);
      
      setTranscripts(prev => {
        const newTranscript = {
          id: segmentStartTime,
          text: result.text,
          timestamp: segmentStartTime,
          segmentNumber: segmentNumber,
          processedAt: Date.now(),
          recordingStartTime: recordingStartTime
        };
        
        return [...prev, newTranscript].sort((a, b) => a.timestamp - b.timestamp);
      });
      
      console.log(`음성 세그먼트 ${segmentNumber} 처리 완료:`, result.text);
      
    } catch (error) {
      console.error(`음성 세그먼트 ${segmentNumber} 처리 실패:`, error);
      
      setTranscripts(prev => {
        const errorTranscript = {
          id: segmentStartTime,
          text: `[처리 오류: ${error.message}]`,
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
    if (!isModelReady) {
      alert('모델이 아직 로딩 중입니다. 잠시 후 다시 시도해주세요.');
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

  const formatElapsedTime = useCallback((timestamp, startTime) => {
    if (!startTime) return '';
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
      const elapsedTime = formatElapsedTime(transcript.timestamp, recordingStartTime);
      content += `[음성 #${transcript.segmentNumber}] ${elapsedTime}\n`;
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

  const downloadAsJson = useCallback(() => {
    if (transcripts.length === 0) {
      alert('다운로드할 회의록이 없습니다.');
      return;
    }

    const meetingDate = new Date().toLocaleDateString('ko-KR');
    const meetingTime = recordingStartTime ? new Date(recordingStartTime).toLocaleTimeString('ko-KR') : '';
    
    // 타임스탬프 순으로 정렬
    const sortedTranscripts = [...transcripts].sort((a, b) => a.timestamp - b.timestamp);

    const jsonData = {
      metadata: {
        title: '회의록',
        date: meetingDate,
        startTime: meetingTime,
        recordingStartTimestamp: recordingStartTime,
        totalSegments: transcripts.length,
        vadBased: true,
        modelInfo: modelInfo,
        exportedAt: new Date().toISOString()
      },
      segments: sortedTranscripts.map(transcript => ({
        segmentNumber: transcript.segmentNumber,
        elapsedTime: formatElapsedTime(transcript.timestamp, recordingStartTime),
        text: transcript.text || '',
        isEmpty: !transcript.text || transcript.text.trim() === '',
        isError: transcript.isError || false,
        timestamp: transcript.timestamp,
        processedAt: transcript.processedAt,
        processingTime: transcript.processedAt ? new Date(transcript.processedAt).toISOString() : null
      })),
      summary: {
        totalDurationSeconds: transcripts.length > 0 ? Math.floor((Math.max(...transcripts.map(t => t.timestamp)) - recordingStartTime) / 1000) : 0,
        segmentsWithText: sortedTranscripts.filter(t => t.text && t.text.trim() && !t.isError).length,
        segmentsEmpty: sortedTranscripts.filter(t => !t.text || t.text.trim() === '').length,
        segmentsWithErrors: sortedTranscripts.filter(t => t.isError).length
      }
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `회의록_${meetingDate.replace(/\./g, '')}_${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [transcripts, recordingStartTime, modelInfo, formatElapsedTime]);


  const getStatusText = () => {
    if (!isModelReady) {
      if (isModelLoading) {
        return `Whisper Turbo 모델 로딩 중... ${loadingProgress}%`;
      }
      if (sttError) return `모델 오류: ${sttError}`;
      return '모델 준비 중...';
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

  const getStatusClass = () => {
    if (!isModelReady || sttError || recordingError) return 'status ready';
    if (isRecording) return 'status recording';
    if (isProcessing) return 'status processing';
    return 'status ready';
  };

  return (
    <div className="app">
      <h1>회의록 STT 앱 (VAD 기반)</h1>
      
      <div className="controls">
        <button
          className={`record-button ${isRecording ? 'recording' : 'stopped'}`}
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={!isModelReady && !sttError}
        >
          {isRecording ? '녹음 중지' : '녹음 시작'}
        </button>
        
        {isRecording && (
          <div style={{ marginLeft: '16px', fontSize: '14px', color: '#6b7280' }}>
            감지된 음성: {segmentCount}개
          </div>
        )}
        
        <div className={getStatusClass()}>
          {isModelLoading && <div className="loading"><div className="spinner"></div></div>}
          {getStatusText()}
        </div>
      </div>

      {/* 다운로드 섹션 */}
      {transcripts.length > 0 && !isRecording && (
        <div className="download-section">
          <h3>회의록 다운로드</h3>
          <div className="download-buttons">
            <button 
              className="download-button txt"
              onClick={downloadAsText}
              title="텍스트 파일로 다운로드"
            >
              📄 TXT 다운로드
            </button>
            <button 
              className="download-button json"
              onClick={downloadAsJson}
              title="JSON 파일로 다운로드 (상세 정보 포함)"
            >
              📋 JSON 다운로드
            </button>
          </div>
          <div className="download-info">
            <span>총 {transcripts.length}개 음성 세그먼트</span>
            <span> • </span>
            <span>VAD 기반 자동 감지</span>
            <span> • </span>
            <span>모델: {modelInfo?.description || 'Unknown'}</span>
          </div>
        </div>
      )}

      {(sttError || recordingError) && (
        <div style={{ color: 'red', marginBottom: '20px' }}>
          오류: {sttError || recordingError}
        </div>
      )}

      <div className="transcript-container">
        <h2>회의 내용</h2>
        
        {transcripts.length === 0 && !isRecording && (
          <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
            녹음 버튼을 눌러 회의를 시작하세요.
          </p>
        )}

        {isRecording && transcripts.length === 0 && (
          <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
            음성 감지 대기 중... 말씀하시면 자동으로 녹음됩니다.
          </p>
        )}

        {transcripts.map((transcript) => (
          <div 
            key={transcript.id} 
            className="transcript-item"
            style={{
              borderLeftColor: transcript.isError ? '#ef4444' : '#3b82f6'
            }}
          >
            <div className="transcript-timestamp">
              음성 #{transcript.segmentNumber} ({formatElapsedTime(transcript.timestamp, recordingStartTime)})
              {transcript.processedAt && (
                <span style={{ marginLeft: '8px', fontSize: '11px', color: '#9ca3af' }}>
                  • 처리완료: {new Date(transcript.processedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div 
              className="transcript-text"
              style={{
                color: transcript.isError ? '#dc2626' : '#1f2937',
                fontStyle: transcript.isError ? 'italic' : 'normal'
              }}
            >
              {transcript.text || '(텍스트가 비어있습니다)'}
            </div>
          </div>
        ))}
        
        {isRecording && isProcessing && (
          <div className="transcript-item" style={{ borderLeftColor: '#f59e0b' }}>
            <div className="loading">
              <div className="spinner"></div>
              STT 처리 중...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;