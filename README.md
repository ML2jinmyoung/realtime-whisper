# VAD 기반 실시간 STT 회의록 앱

Whisper Turbo 모델과 VAD(Voice Activity Detection)를 사용하여 브라우저에서 실시간으로 음성을 텍스트로 변환하는 React 앱입니다.

## 🎯 주요 기능

- **🎤 VAD 기반 음성 감지**: 음성이 감지될 때만 자동으로 녹음 시작/종료
- **⚡ 실시간 STT**: Hugging Face Transformers.js와 Whisper Turbo 모델 사용
- **🔒 완전 로컬 처리**: 서버 없이 모든 처리를 브라우저에서 수행 (프라이버시 보장)
- **🚀 WebGPU/CPU 지원**: WebGPU 우선, 실패시 CPU로 자동 대체
- **📥 다운로드 기능**: TXT/JSON 형식으로 회의록 다운로드
- **🎨 실시간 상태 표시**: 음성 대기, 녹음 중, 처리 중 상태 실시간 표시


## 🛠 기술 스택

- **Frontend**: React 18
- **STT 모델**: Whisper Large V3 Turbo (ONNX)
- **VAD 라이브러리**: @ricky0123/vad-web (WebAssembly 기반)
- **ML 프레임워크**: @huggingface/transformers
- **오디오 처리**: Web Audio API, MediaRecorder API


## 🏗 코드 구조

### 디렉터리 구조

```
realtime-whisper/
├── src/
│   ├── App.js             # 메인 애플리케이션 컴포넌트
│   ├── useVADRecording.js # VAD 기반 오디오 녹음 훅
│   ├── useWhisperSTT.js   # STT 처리 커스텀 훅
│   ├── workers/
│   │   └── whisper-worker.js # Web Worker에서 STT 처리

```

### 주요 컴포넌트 설명

#### 1. **App.js** - 메인 애플리케이션

```javascript
// 주요 상태 관리
- transcripts: STT 결과 배열 (음성 세그먼트별)
- recordingStartTime: 녹음 시작 시간
- processingCountRef: 처리 중인 세그먼트 카운터

// 핵심 기능
- handleAudioSegment(): VAD에서 전달받은 오디오 세그먼트 처리
- downloadAsText(): TXT 형식 다운로드
- downloadAsJson(): JSON 형식 다운로드 (메타데이터 포함)
- formatElapsedTime(): 경과 시간 포맷팅
```

#### 2. **useVADRecording.js** - VAD 기반 녹음 훅

```javascript
// @ricky0123/vad-web 기반 음성 감지
- initializeVAD(): VAD 모델 초기화 및 콜백 설정
- startRecording(): 마이크 스트림 획득 및 VAD 시작
- stopRecording(): VAD 중지 및 리소스 정리

// VAD 상태
- listening: 음성 대기 중
- speaking: 음성 감지하여 녹음 중
- processing: 음성 종료 후 STT 처리 중
- idle: 비활성 상태

// 핵심 특징
- 실시간 음성 활동 감지 (WebAssembly 기반)
- 음성 시작/종료 자동 감지
- MediaRecorder와 연동한 정확한 오디오 캡처
```

#### 3. **useWhisperSTT.js** - STT 처리 훅

```javascript
// Hugging Face Transformers.js 기반 STT
- initializeModel(): 모델 로딩 (폴백 시스템)
- transcribeAudio(): 오디오 → 텍스트 변환
- processAudioQueue(): 큐 기반 순차 처리
- audioBufferFromBlob(): 오디오 데이터 전처리

// 모델 폴백 시스템
1. onnx-community/whisper-large-v3-turbo_timestamped (기본)
2. onnx-community/whisper-large-v3-turbo (대안)

// Web Worker 활용
- 메인 스레드 블로킹 방지
- 백그라운드에서 STT 처리
```

#### 4. **whisper-worker.js** - Web Worker STT 처리

```javascript
// Transformers.js Web Worker
- tryLoadModel(): WebGPU/CPU 폴백으로 모델 로딩
- transcribe(): 실제 STT 수행
- progress_callback: 모델 로딩 진행률 표시

// 디바이스 최적화
- WebGPU: fp16 인코더, q4 디코더 (고성능)
- CPU: fp32 전체 (호환성)
```

## 🔄 VAD 기반 데이터 플로우

```
1. 사용자 "녹음 시작" 클릭
   ↓
2. useVADRecording 초기화
   - MicVAD.new() 호출
   - 마이크 스트림 획득
   - VAD 모델 로딩
   ↓
3. VAD 리스닝 시작 (음성 대기)
   - onSpeechStart: 음성 감지 시 MediaRecorder 시작
   - onSpeechEnd: 음성 종료 시 MediaRecorder 중지
   ↓
4. 각 음성 세그먼트마다 handleAudioSegment 호출
   ↓
5. useWhisperSTT로 오디오 데이터 전송
   - audioBufferFromBlob(): Blob → Float32Array 변환
   - 16kHz 리샘플링, 스테레오 → 모노 변환
   ↓
6. Web Worker에서 Whisper 모델로 STT 처리
   - 언어: 한국어
   - 태스크: transcribe
   ↓
7. 결과를 transcripts 배열에 저장
   ↓
8. UI 실시간 업데이트
   - 음성 #N (경과시간)
   - STT 텍스트 결과
   ↓
9. 사용자 "녹음 중지" 클릭
   ↓
10. 다운로드 섹션 표시
    - TXT: 읽기 쉬운 형식
```

## 🎨 UI 컴포넌트

### 컨트롤 섹션
- **녹음 버튼**: 시작/중지 토글
- **감지된 음성 카운터**: 실시간 음성 세그먼트 수 표시
- **상태 표시**: 
  - 🎧 음성 대기 중
  - 🎤 음성 녹음 중  
  - ⚙️ STT 처리 중

### 다운로드 섹션
- **TXT 다운로드 버튼**
- **메타정보**: 총 음성 세그먼트 수, VAD 기반 감지, 사용 모델
- **녹음 완료 후에만 표시**

### 트랜스크립트 섹션
- **음성별 결과 표시**: 음성 #N (경과시간)
- **처리 완료 시간**: 실제 STT 처리 완료된 시간
- **에러 구분**: 처리 실패한 세그먼트 별도 표시

## 🔧 기술적 특징

### VAD (Voice Activity Detection)
- **라이브러리**: @ricky0123/vad-web
- **기반 기술**: WebAssembly (Silero VAD 모델)
- **동작 원리**: 완전 로컬, API 사용 안함
- **프레임 단위**: 16ms 간격으로 음성/침묵 판단
- **설정**:
  - `positiveSpeechThreshold: 0.5` (음성 감지 민감도)
  - `negativeSpeechThreshold: 0.35` (음성 종료 민감도)
  - `minSpeechFrames: 3` (최소 음성 프레임)

### 오디오 처리
- **샘플링 레이트**: 16kHz (Whisper 최적화)
- **채널**: 모노 (스테레오 → 모노 자동 변환)
- **포맷**: WebM/Opus (MediaRecorder 기본)
- **전처리**: AudioContext를 통한 리샘플링

### STT 모델
- **모델**: Whisper Large V3 Turbo
- **라이브러리**: @huggingface/transformers
- **실행 환경**: Web Worker (메인 스레드 보호)
- **디바이스**: WebGPU 우선, CPU 폴백
- **언어**: 한국어 (다국어 모델)

### 성능 최적화
- **WebGPU 가속**: 지원시 자동 활성화
- **모델 캐싱**: 브라우저 IndexedDB 활용
- **큐 기반 처리**: 순차적 STT 처리로 안정성 확보
- **메모리 관리**: AudioContext 자동 해제
- **VAD 최적화**: 침묵 구간 STT 처리 제거

## 📊 파일 형식

### TXT 형식
```
회의록
날짜: 2025. 8. 20.
시작 시간: 오후 2:13:00
총 음성 세그먼트: 5개
VAD 기반 음성 감지

==================================================

[음성 #1] 0:15
안녕하세요. 오늘 회의를 시작하겠습니다.

[음성 #2] 1:23
첫 번째 안건에 대해 논의해보겠습니다.

[음성 #3] 2:45
다음 프로젝트 일정을 확인해주세요.
```


## 📋 필요 조건

- **브라우저**: Chrome, Edge, Firefox (WebAssembly 지원)
- **마이크**: 마이크 권한 허용 필요
- **네트워크**: 최초 모델 다운로드시에만 필요 (이후 오프라인 동작)
- **권장**: WebGPU 지원 브라우저 (성능 최적화)


## 📄 라이선스

MIT License