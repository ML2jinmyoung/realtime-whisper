# 회의록 STT 앱

Whisper 모델을 사용하여 브라우저에서 실시간으로 음성을 텍스트로 변환하는 React 앱입니다.

##  주요 기능

- **실시간 STT**: Hugging Face Transformers.js와 Whisper 모델 사용
- **세그먼트 기반 처리**: 설정 가능한 간격(30초~5분)으로 오디오 분할 처리
- **연속 녹음**: 중간에 빠지는 오디오 없이 연속적인 녹음
- **WebGPU/CPU 지원**: WebGPU 우선, 실패시 CPU로 자동 대체
- **다운로드 기능**: TXT/JSON 형식으로 회의록 다운로드
- **브라우저 내 처리**: 서버 없이 모든 처리를 브라우저에서 수행

## 사용법

1. **모델 로딩 대기**: 처음 실행시 Whisper 모델이 자동으로 다운로드됩니다
2. **녹음 시작**: "녹음 시작" 버튼 클릭
3. **세그먼트 길이 설정**: 30초, 1분, 2분, 5분 중 선택 (기본값: 1분)
4. **실시간 변환 확인**: 설정된 간격마다 STT 결과가 화면에 표시됩니다
5. **녹음 중지**: "녹음 중지" 버튼으로 회의 종료
6. **다운로드**: TXT 또는 JSON 형식으로 회의록 다운로드

## 코드 구조 분석

###  디렉터리 구조

```
test/
├── public/
│   ├── index.html          # HTML 템플릿
│   └── _headers           # CORS 헤더 설정
├── src/
├── workers/ worker.js 
│   ├── App.js             # 메인 애플리케이션 컴포넌트
│   ├── useAudioRecording.js # 오디오 녹음 커스텀 훅
│   ├── useWhisperSTT.js   # STT 처리 커스텀 훅
│   ├── index.js           # React 앱 진입점
│   └── index.css          # 전체 스타일시트
├── package.json           # 프로젝트 의존성 및 설정
└── README.md             # 프로젝트 문서
```


#### 1. **App.js** - 메인 애플리케이션

```javascript
// 주요 상태 관리
- transcripts: STT 결과 배열
- recordingStartTime: 녹음 시작 시간
- segmentDuration: 세그먼트 길이 (초)

// 핵심 기능
- handleAudioSegment(): 오디오 세그먼트 처리
- downloadAsText(): TXT 형식 다운로드
- downloadAsJson(): JSON 형식 다운로드
- getSegmentTimeRange(): 시간 범위 포맷팅
```

#### 2. **useAudioRecording.js** - 오디오 녹음 훅

```javascript
// MediaRecorder API 기반 연속 녹음
- startRecording(): 녹음 시작 및 세그먼트 간격 설정
- stopRecording(): 녹음 중지 및 리소스 정리
- onAudioSegment(): 세그먼트 완료시 콜백 실행

// 핵심 특징
- 주기적 MediaRecorder 재시작으로 끊김 없는 녹음
- 16kHz 모노 오디오 최적화
- 에코 캔슬레이션 및 노이즈 서프레션
```

#### 3. **useWhisperSTT.js** - STT 처리 훅

```javascript
// Hugging Face Transformers.js 기반 STT
- initializeModel(): 모델 로딩 (Tiny → Base → Small → Turbo)
- transcribeAudio(): 오디오 → 텍스트 변환
- processAudioQueue(): 큐 기반 순차 처리

// 모델 폴백 시스템
openai/whisper-large-v3-turbo
```

### 🔄 데이터 플로우

```
1. 사용자 "녹음 시작" 클릭
   ↓
2. useAudioRecording 시작
   - MediaRecorder 초기화
   - 설정된 간격마다 세그먼트 생성
//   ↓
3. 각 세그먼트마다 handleAudioSegment 호출
   ↓
4. useWhisperSTT로 오디오 데이터 전송
   - audioBufferFromBlob(): Blob → Float32Array 변환
   - 16kHz 리샘플링
   - 스테레오 → 모노 변환
   ↓
5. Whisper 모델로 STT 처리
   - 언어: 한국어 (다국어 모델)
   - 태스크: transcribe
   ↓
6. 결과를 transcripts 배열에 저장
   ↓
7. UI 업데이트 (실시간 표시)
   ↓
8. 사용자 "녹음 중지" 클릭
   ↓
9. 다운로드 섹션 표시
   - TXT: 읽기 쉬운 형식
   - JSON: 메타데이터 포함 상세 형식
```

### UI 컴포넌트

#### 컨트롤 섹션

- 녹음 시작/중지 버튼
- 세그먼트 길이 선택 드롭다운
- 상태 표시 (모델 로딩, 녹음 중, 처리 중)

#### 다운로드 섹션

- TXT/JSON 다운로드 버튼
- 세그먼트 수, 총 시간, 사용 모델 표시
- 녹음 완료 후에만 표시

#### 트랜스크립트 섹션

- 세그먼트별 결과 표시
- 시간 범위 (예: 0:00 - 1:00)
- 처리 완료 시간 표시
- 에러 세그먼트 구분 표시

### 🔧 기술적 특징

#### 오디오 처리

- **샘플링 레이트**: 16kHz (Whisper 최적화)
- **채널**: 모노 (스테레오 → 모노 자동 변환)
- **포맷**: WebM/Opus (MediaRecorder 기본)
- **리샘플링**: 브라우저 AudioContext 사용

#### STT 모델

- **라이브러리**: @huggingface/transformers@3.0.2
- **모델 타입**: automatic-speech-recognition
- **디바이스**: WebGPU 우선, CPU 폴백
- **언어**: 한국어 (다국어 모델에서)

#### 성능 최적화

- **WebGPU 가속**: 지원시 자동 활성화
- **모델 캐싱**: 브라우저 캐시 활용
- **큐 기반 처리**: 순차적 STT 처리
- **메모리 관리**: AudioContext 자동 해제

### 📊 파일 형식

#### TXT 형식

```
회의록
날짜: 2025. 8. 13.
시작 시간: 오후 2:13:00
총 세그먼트: 3개
세그먼트 길이: 30초

==================================================

[세그먼트 #1] 0:00 - 0:30
안녕하세요. 오늘 회의를 시작하겠습니다.

[세그먼트 #2] 0:30 - 1:00
첫 번째 안건에 대해 논의해보겠습니다.
```

#### JSON 형식

```json
{
  "metadata": {
    "title": "회의록",
    "date": "2025. 8. 13.",
    "totalSegments": 3,
    "segmentDurationSeconds": 30,
    "modelInfo": {...}
  },
  "segments": [...],
  "summary": {
    "totalDurationSeconds": 90,
    "segmentsWithText": 2,
    "segmentsEmpty": 1
  }
}
```




