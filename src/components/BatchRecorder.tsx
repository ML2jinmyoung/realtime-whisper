import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useWhisperSTT } from '../useWhisperSTT';
import { Transcript } from '../types';

interface TimestampedSegment {
  text: string;
  start: number;
  end: number;
}

interface BatchRecorderProps {
  currentLanguage: 'korean' | 'english';
  isModelReady: boolean;
  isModelLoading: boolean;
  sttError: string | null;
  onRecordingStateChange?: (state: { isRecording: boolean; isPaused: boolean }) => void;
}

export const BatchRecorder: React.FC<BatchRecorderProps> = ({ 
  currentLanguage, 
  isModelReady, 
  isModelLoading, 
  sttError,
  onRecordingStateChange
}) => {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [timestampedSegments, setTimestampedSegments] = useState<TimestampedSegment[]>([]);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);
  
  // 오디오 관련 refs
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  
  const {
    transcribeAudio
  } = useWhisperSTT();

  // 오디오 레벨 분석 시작
  const startAudioLevelAnalysis = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.9;
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
        
        setAudioLevel(prev => prev !== roundedLevel ? roundedLevel : prev);
        
        setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }, 33);
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

  // 녹음 시간 업데이트
  const startDurationTimer = useCallback(() => {
    durationIntervalRef.current = window.setInterval(() => {
      if (recordingStartTime && !isPaused) {
        setRecordingDuration(Math.floor((Date.now() - recordingStartTime) / 1000));
      }
    }, 1000);
  }, [recordingStartTime, isPaused]);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const handleStartRecording = useCallback(async () => {
    if (!isModelReady) {
      alert(`모델이 아직 준비되지 않았습니다.\n상태: ${isModelLoading ? '로딩 중...' : '준비 중'}\n${sttError ? `오류: ${sttError}` : ''}`);
      return;
    }

    try {
      console.log('🎬 배치 녹음 시작');
      
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
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // 오디오 레벨 분석 시작
      startAudioLevelAnalysis(stream);
      
      // 녹음 시작
      mediaRecorder.start();
      setIsRecording(true);
      onRecordingStateChange?.({ isRecording: true, isPaused: false });
      setRecordingStartTime(Date.now());
      setRecordingDuration(0);
      setTranscripts([]);
      setTimestampedSegments([]);
      
      // 시간 업데이트 시작
      startDurationTimer();
      
    } catch (err) {
      console.error('배치 녹음 시작 실패:', err);
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      alert('녹음 시작 실패: ' + errorMessage);
    }
  }, [isModelReady, isModelLoading, sttError, startAudioLevelAnalysis, startDurationTimer, onRecordingStateChange]);

  const handlePauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
    
    stopAudioLevelAnalysis();
    stopDurationTimer();
    setIsPaused(true);
    onRecordingStateChange?.({ isRecording: true, isPaused: true });
    console.log('⏸️ 배치 녹음 일시정지');
  }, [stopAudioLevelAnalysis, stopDurationTimer, onRecordingStateChange]);

  const handleResumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
    }
    
    if (streamRef.current) {
      startAudioLevelAnalysis(streamRef.current);
    }
    
    startDurationTimer();
    setIsPaused(false);
    onRecordingStateChange?.({ isRecording: true, isPaused: false });
    console.log('▶️ 배치 녹음 재개');
  }, [startAudioLevelAnalysis, startDurationTimer, onRecordingStateChange]);

  const handleStopRecording = useCallback(async () => {
    console.log('🛑 배치 녹음 종료 및 STT 처리 시작');
    
    // 녹음 종료
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    // 리소스 정리
    stopAudioLevelAnalysis();
    stopDurationTimer();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsRecording(false);
    setIsPaused(false);
    onRecordingStateChange?.({ isRecording: false, isPaused: false });
    setIsProcessingBatch(true);
    
    // 녹음 데이터가 준비될 때까지 잠깐 대기
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      // 전체 오디오 blob 생성
      const fullBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      console.log('📦 전체 오디오 blob 생성 완료, 크기:', fullBlob.size);
      
      if (fullBlob.size === 0) {
        throw new Error('녹음된 오디오가 없습니다');
      }
      
      // STT 처리 (타임스탬프 포함)
      console.log(`🌐 배치 STT 처리 시작 - 언어: ${currentLanguage}`);
      const result = await transcribeAudio(fullBlob, recordingStartTime || Date.now(), currentLanguage, true);
      
      console.log('✅ 배치 STT 처리 완료:', result);
      
      // 타임스탬프가 있는 경우 세그먼트별로 분리
      if (result.chunks && result.chunks.length > 0) {
        const startTime = recordingStartTime || Date.now();
        const newTranscripts: Transcript[] = result.chunks.map((chunk, index) => ({
          id: startTime + index,
          text: chunk.text,
          timestamp: startTime + (chunk.timestamp[0] * 1000), // 초를 밀리초로 변환
          segmentNumber: index + 1,
          processedAt: Date.now(),
          recordingStartTime: recordingStartTime
        }));
        
        const segments: TimestampedSegment[] = result.chunks.map(chunk => ({
          text: chunk.text,
          start: chunk.timestamp[0],
          end: chunk.timestamp[1]
        }));
        
        setTranscripts(newTranscripts);
        setTimestampedSegments(segments);
        console.log('✅ 타임스탬프별 세그먼트 생성:', segments.length, '개');
      } else {
        // 타임스탬프가 없는 경우 전체 텍스트로 처리
        const finalTranscript: Transcript = {
          id: recordingStartTime || Date.now(),
          text: result.text,
          timestamp: recordingStartTime || Date.now(),
          segmentNumber: 1,
          processedAt: Date.now(),
          recordingStartTime: recordingStartTime
        };
        
        setTranscripts([finalTranscript]);
        setTimestampedSegments([]);
      }
      
    } catch (error) {
      console.error('배치 STT 처리 실패:', error);
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      
      const errorTranscript: Transcript = {
        id: recordingStartTime || Date.now(),
        text: `[배치 처리 오류: ${errorMessage}]`,
        timestamp: recordingStartTime || Date.now(),
        segmentNumber: 1,
        processedAt: Date.now(),
        recordingStartTime: recordingStartTime,
        isError: true
      };
      
      setTranscripts([errorTranscript]);
      setTimestampedSegments([]);
    } finally {
      setIsProcessingBatch(false);
      chunksRef.current = [];
    }
  }, [transcribeAudio, currentLanguage, recordingStartTime, stopAudioLevelAnalysis, stopDurationTimer, onRecordingStateChange]);

  const formatDuration = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  const downloadAsText = useCallback(() => {
    if (transcripts.length === 0) {
      alert('다운로드할 회의록이 없습니다.');
      return;
    }

    const meetingDate = new Date().toLocaleDateString('ko-KR');
    const meetingTime = recordingStartTime ? new Date(recordingStartTime).toLocaleTimeString('ko-KR') : '';
    
    let content = `회의록 (한번에 처리 모드)\n`;
    content += `날짜: ${meetingDate}\n`;
    content += `시작 시간: ${meetingTime}\n`;
    content += `녹음 시간: ${formatDuration(recordingDuration)}\n`;
    content += `언어: ${currentLanguage === 'korean' ? '한국어' : '영어'}\n`;
    content += `세그먼트 수: ${transcripts.length}개\n\n`;
    content += `${'='.repeat(50)}\n\n`;

    if (timestampedSegments.length > 0) {
      // 타임스탬프별 세그먼트 표시
      timestampedSegments.forEach((segment, index) => {
        const startTime = formatTime(segment.start);
        const endTime = formatTime(segment.end);
        content += `[${startTime} - ${endTime}]\n`;
        content += `${segment.text || '(텍스트가 비어있습니다)'}\n\n`;
      });
    } else {
      // 전체 텍스트 표시
      transcripts.forEach(transcript => {
        content += `${transcript.text || '(텍스트가 비어있습니다)'}\n\n`;
      });
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `배치회의록_${meetingDate.replace(/\./g, '')}_${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [transcripts, timestampedSegments, recordingStartTime, formatDuration, recordingDuration, currentLanguage, formatTime]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      stopAudioLevelAnalysis();
      stopDurationTimer();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [stopAudioLevelAnalysis, stopDurationTimer]);

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

          {/* 녹음 정보 및 음량 체크 - 강조 */}
          {isRecording && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-4 text-sm text-gray-300">
                <div className="flex items-center gap-2">
                  <span className="text-gray-300">⏱️</span>
                  <span>녹음 시간: <span className="font-semibold text-white">{formatDuration(recordingDuration)}</span></span>
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

      {/* 상태 표시 */}
      {isProcessingBatch && (
        <div className="flex items-center justify-center gap-2 text-yellow-700 py-2">
          <div className="spinner"></div>
          <span>전체 음성을 STT 처리하는 중입니다...</span>
        </div>
      )}

      {/* 다운로드 섹션 - 심플하게 */}
      {transcripts.length > 0 && !isRecording && !isProcessingBatch && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">회의록 다운로드</h3>
            <span className="text-sm text-gray-500">{formatDuration(recordingDuration)} • {transcripts.length}개 세그먼트</span>
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
      {sttError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <span className="font-medium">오류:</span> {sttError}
        </div>
      )}

      {/* STT 결과 - 간단하게 유지 */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">회의 내용</h3>
        
        <div className="max-h-96 overflow-y-auto">
          {transcripts.length === 0 && !isRecording && !isProcessingBatch && (
            <p className="text-gray-500 italic text-center py-8">
              녹음 버튼을 눌러 배치 회의를 시작하세요.<br />
              녹음 종료 후 전체 내용을 한 번에 처리합니다.
            </p>
          )}

          {isRecording && (
            <p className="text-gray-500 italic text-center py-8">
              배치 녹음 중... 종료 버튼을 누르면 전체 내용을 STT 처리합니다.<br />
              현재 녹음 시간: <span className="font-medium text-gray-900">{formatDuration(recordingDuration)}</span>
            </p>
          )}

          {isProcessingBatch && (
            <div className="flex items-center justify-center gap-2 text-yellow-700 py-8">
              <div className="spinner"></div>
              <span>전체 음성을 STT 처리하는 중입니다...</span>
            </div>
          )}

          {transcripts.length > 0 && (
            <div className="text-gray-800 leading-relaxed space-y-3">
              {timestampedSegments.length > 0 ? (
                // 타임스탬프가 있는 경우 - 세그먼트별 표시
                timestampedSegments.map((segment, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="text-xs text-gray-500 mb-2">
                      [{formatTime(segment.start)} - {formatTime(segment.end)}]
                    </div>
                    <div className="text-gray-800">
                      {segment.text || '(텍스트가 비어있습니다)'}
                    </div>
                  </div>
                ))
              ) : (
                // 타임스탬프가 없는 경우 - 전체 텍스트 표시
                transcripts.map((transcript, index) => (
                  <div key={transcript.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="text-xs text-gray-500 mb-2">
                      녹음 시간: {formatDuration(recordingDuration)} | 
                      처리 완료: {new Date(transcript.processedAt).toLocaleTimeString('ko-KR')}
                    </div>
                    <div className={transcript.isError ? 'text-red-600 italic' : 'text-gray-800'}>
                      {transcript.text || '(텍스트가 비어있습니다)'}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};