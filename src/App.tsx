import React, { useState, useEffect } from 'react';
import { RealTimeRecorder } from './components/RealTimeRecorder';
import { BatchRecorder } from './components/BatchRecorder';
import { useWhisperSTT } from './useWhisperSTT';
import './index.css';

// 녹음 상태를 추적하기 위한 인터페이스
interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
}

type RecordingMode = 'realtime' | 'batch';

function App(): JSX.Element {
  const [recordingMode, setRecordingMode] = useState<RecordingMode>('realtime');
  const [currentLanguage, setCurrentLanguage] = useState<'korean' | 'english'>('korean');
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false
  });
  
  // Whisper STT 훅 사용
  const {
    isModelLoading,
    isModelReady,
    isProcessing,
    error: sttError,
    loadingProgress,
    modelInfo,
    initializeModel
  } = useWhisperSTT();

  // 컴포넌트 마운트 시 모델 초기화
  useEffect(() => {
    initializeModel();
  }, [initializeModel]);

  const getModelStatusText = () => {
    if (!isModelReady) {
      if (isModelLoading) {
        return `Whisper Large V3 Turbo 로딩 중... ${loadingProgress}%`;
      }
      if (sttError) return `❌ 모델 오류: ${sttError}`;
      return '⏳ 모델 준비 중...';
    }
    
    if (isProcessing) return 'STT 처리 중...';
    return `✅ 준비 완료 (${modelInfo?.description || 'Whisper Large V3 Turbo'})`;
  };

  // 언어 변경 가능 여부 결정
  const canChangeLanguage = () => {
    if (!recordingState.isRecording) return true;
    if (recordingMode === 'realtime') {
      return recordingState.isPaused;
    } else {
      return false;
    }
  };

  const handleLanguageChange = (newLanguage: 'korean' | 'english') => {
    if (canChangeLanguage()) {
      setCurrentLanguage(newLanguage);
      console.log('🔄 언어 설정 변경:', currentLanguage, '→', newLanguage);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            회의록 STT
          </h1>
          <p className="text-gray-600">
            VAD 기반 실시간 음성 인식 회의록 작성 도구
          </p>
        </div>
        
        {/* 상단 컨트롤: 모델 상태 + 언어 설정 */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
          <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-full text-sm font-medium shadow-sm ${
            !isModelReady || sttError ? 'bg-gray-100 text-gray-600' :
            isProcessing ? 'bg-yellow-100 text-yellow-700' :
            'bg-green-100 text-green-700'
          }`}>
            {isModelLoading && <div className="spinner"></div>}
            {getModelStatusText()}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <div className="flex">
              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  currentLanguage === 'korean' 
                    ? 'bg-gray-900 text-white shadow-sm' 
                    : canChangeLanguage()
                      ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      : 'text-gray-400 cursor-not-allowed'
                }`}
                onClick={() => handleLanguageChange('korean')}
                disabled={!canChangeLanguage()}
                title={!canChangeLanguage() ? '녹음 중에는 언어를 변경할 수 없습니다' : ''}
              >
                🇰🇷 한국어
              </button>
              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  currentLanguage === 'english' 
                    ? 'bg-gray-900 text-white shadow-sm' 
                    : canChangeLanguage()
                      ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      : 'text-gray-400 cursor-not-allowed'
                }`}
                onClick={() => handleLanguageChange('english')}
                disabled={!canChangeLanguage()}
                title={!canChangeLanguage() ? '녹음 중에는 언어를 변경할 수 없습니다' : ''}
              >
                🇺🇸 English
              </button>
            </div>
          </div>
        </div>

        {/* 모드 선택 - 심플하게 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 text-center">녹음 모드</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              className={`p-6 rounded-xl border-2 transition-all duration-200 text-left ${
                recordingMode === 'realtime'
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => setRecordingMode('realtime')}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">⚡</span>
                </div>
                <div className="font-semibold text-gray-900">실시간 STT</div>
              </div>
              <p className="text-sm text-gray-600">
                말하는 즉시 텍스트로 변환되어 실시간으로 확인 가능
              </p>
            </button>
            
            <button
              className={`p-6 rounded-xl border-2 transition-all duration-200 text-left ${
                recordingMode === 'batch'
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => setRecordingMode('batch')}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">📦</span>
                </div>
                <div className="font-semibold text-gray-900">한번에 STT</div>
              </div>
              <p className="text-sm text-gray-600">
                녹음 종료 후 전체 내용을 한 번에 변환
              </p>
            </button>
          </div>
        </div>

        {/* 선택된 모드에 따른 컴포넌트 렌더링 */}
        {recordingMode === 'realtime' ? (
          <RealTimeRecorder 
            currentLanguage={currentLanguage}
            isModelReady={isModelReady}
            isModelLoading={isModelLoading}
            sttError={sttError}
            onRecordingStateChange={setRecordingState}
          />
        ) : (
          <BatchRecorder 
            currentLanguage={currentLanguage}
            isModelReady={isModelReady}
            isModelLoading={isModelLoading}
            sttError={sttError}
            onRecordingStateChange={setRecordingState}
          />
        )}
      </div>
    </div>
  );
}

export default App;