import React, { useState, useCallback, useRef } from 'react';
import { useAudioRecording } from './useAudioRecording';
import { useWhisperSTT } from './useWhisperSTT';
import './index.css';

function App() {
  const [transcripts, setTranscripts] = useState([]);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [segmentDuration, setSegmentDuration] = useState(60);
  
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

    const segmentNumber = Math.floor((segmentStartTime - recordingStartTime) / (segmentDuration * 1000)) + 1;
    
    console.log(`세그먼트 ${segmentNumber} 처리 시작`);
    
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
        
        const existingIndex = prev.findIndex(t => t.id === segmentStartTime);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = newTranscript;
          return updated.sort((a, b) => a.timestamp - b.timestamp);
        }
        
        return [...prev, newTranscript].sort((a, b) => a.timestamp - b.timestamp);
      });
      
      console.log(`세그먼트 ${segmentNumber} 처리 완료:`, result.text);
      
    } catch (error) {
      console.error(`세그먼트 ${segmentNumber} 처리 실패:`, error);
      
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
        
        const existingIndex = prev.findIndex(t => t.id === segmentStartTime);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = errorTranscript;
          return updated.sort((a, b) => a.timestamp - b.timestamp);
        }
        
        return [...prev, errorTranscript].sort((a, b) => a.timestamp - b.timestamp);
      });
    } finally {
      processingCountRef.current--;
    }
  }, [isModelReady, transcribeAudio, recordingStartTime, segmentDuration]);

  const {
    isRecording,
    error: recordingError,
    startRecording,
    stopRecording
  } = useAudioRecording(handleAudioSegment, segmentDuration * 1000);

  const handleStartRecording = useCallback(async () => {
    if (!isModelReady) {
      alert('모델이 아직 로딩 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    
    setTranscripts([]);
    setRecordingStartTime(Date.now());
    await startRecording();
  }, [isModelReady, startRecording]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    setRecordingStartTime(null);
  }, [stopRecording]);

  const getSegmentTimeRange = useCallback((segmentNumber, segmentDuration) => {
    const startSeconds = (segmentNumber - 1) * segmentDuration;
    const endSeconds = segmentNumber * segmentDuration;
    
    const formatTime = (totalSeconds) => {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };
    
    return `${formatTime(startSeconds)} - ${formatTime(endSeconds)}`;
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
    content += `총 세그먼트: ${transcripts.length}개\n`;
    content += `세그먼트 길이: ${segmentDuration}초\n\n`;
    content += `${'='.repeat(50)}\n\n`;

    // 타임스탬프 순으로 정렬
    const sortedTranscripts = [...transcripts].sort((a, b) => a.timestamp - b.timestamp);
    
    sortedTranscripts.forEach((transcript) => {
      const timeRange = getSegmentTimeRange(transcript.segmentNumber, segmentDuration);
      content += `[세그먼트 #${transcript.segmentNumber}] ${timeRange}\n`;
      content += `${transcript.text || '(음성이 감지되지 않았습니다)'}\n\n`;
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
  }, [transcripts, recordingStartTime, segmentDuration, getSegmentTimeRange]);

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
        segmentDurationSeconds: segmentDuration,
        modelInfo: modelInfo,
        exportedAt: new Date().toISOString()
      },
      segments: sortedTranscripts.map(transcript => ({
        segmentNumber: transcript.segmentNumber,
        timeRange: getSegmentTimeRange(transcript.segmentNumber, segmentDuration),
        startTime: (transcript.segmentNumber - 1) * segmentDuration,
        endTime: transcript.segmentNumber * segmentDuration,
        text: transcript.text || '',
        isEmpty: !transcript.text || transcript.text.trim() === '',
        isError: transcript.isError || false,
        timestamp: transcript.timestamp,
        processedAt: transcript.processedAt,
        processingTime: transcript.processedAt ? new Date(transcript.processedAt).toISOString() : null
      })),
      summary: {
        totalDurationSeconds: transcripts.length * segmentDuration,
        totalDurationFormatted: getSegmentTimeRange(transcripts.length, segmentDuration).split(' - ')[1],
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
  }, [transcripts, recordingStartTime, segmentDuration, modelInfo, getSegmentTimeRange]);

  const formatTimestamp = useCallback((timestamp, startTime) => {
    if (!startTime) return '';
    const elapsed = Math.floor((timestamp - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const getStatusText = () => {
    if (!isModelReady) {
      if (isModelLoading) {
        return `Whisper Turbo 모델 로딩 중... ${loadingProgress}%`;
      }
      if (sttError) return `모델 오류: ${sttError}`;
      return '모델 준비 중...';
    }
    
    if (isRecording) {
      if (isProcessing) return '녹음 중 & STT 처리 중...';
      return '녹음 중...';
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
      <h1>회의록 STT 앱</h1>
      
      <div className="controls">
        <button
          className={`record-button ${isRecording ? 'recording' : 'stopped'}`}
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={!isModelReady && !sttError}
        >
          {isRecording ? '녹음 중지' : '녹음 시작'}
        </button>
        
        <div>
          <label>
            세그먼트 길이: 
            <select 
              value={segmentDuration} 
              onChange={(e) => setSegmentDuration(Number(e.target.value))}
              disabled={isRecording}
              style={{ marginLeft: '8px' }}
            >
              <option value={30}>30초</option>
              <option value={60}>1분</option>
              <option value={120}>2분</option>
              <option value={300}>5분</option>
            </select>
          </label>
        </div>
        
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
            <span>총 {transcripts.length}개 세그먼트</span>
            <span> • </span>
            <span>총 시간: {transcripts.length > 0 ? getSegmentTimeRange(transcripts.length, segmentDuration).split(' - ')[1] : '0:00'}</span>
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
            녹음 중... 첫 번째 세그먼트 처리를 기다리고 있습니다.
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
              세그먼트 #{transcript.segmentNumber} ({getSegmentTimeRange(transcript.segmentNumber, segmentDuration)})
              {transcript.processedAt && (
                <span style={{ marginLeft: '8px', fontSize: '11px', color: '#9ca3af' }}>
                  • 처리완료: {formatTimestamp(new Date(transcript.processedAt).toLocaleTimeString())}
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
              {transcript.text || '(음성이 감지되지 않았습니다)'}
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