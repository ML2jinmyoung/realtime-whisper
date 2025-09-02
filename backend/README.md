# STT 요약 백엔드 서버

FastAPI 기반의 STT 결과 요약 및 메일 발송 서비스입니다.


#### 필수 환경변수:
- `OPENAI_API_KEY`: OpenAI API 키
- `GMAIL_USER`: Gmail 계정 (발송자)
- `GMAIL_APP_PASSWORD`: Gmail 앱 비밀번호 (16자리)


## 📡 API 엔드포인트

### POST /api/summarize
STT 결과를 요약하고 이메일로 발송합니다.

**요청 형식:**
```json
{
  "transcript": "회의 전체 텍스트...",
  "language": "korean" | "english",
  "email": "user@example.com",
  "meetingInfo": {
    "date": "2024-01-01",
    "startTime": "14:00:00",
    "duration": "30:45",
    "segmentCount": 15
  }
}
```

**응답 형식:**
```json
{
  "success": true,
  "summary": "생성된 요약 텍스트...",
  "emailSent": true,
  "error": null
}
```

### GET /health
서비스 상태 및 설정 확인

## 🛠 주요 기능

1. **OpenAI GPT-4 요약**: STT 결과를 구조화된 형태로 요약
2. **이메일 발송**: HTML 형식의 예쁜 이메일로 요약 결과 전송
3. **언어별 프롬프트**: 한국어/영어 각각에 최적화된 요약 프롬프트
4. **STT 오류 보정**: 음성인식 오류를 감안한 지능적 요약
5. **CORS 지원**: 프런트엔드와의 연동 지원

## 🏗 프로젝트 구조

```
backend/
├── main.py              # FastAPI 메인 서버
├── requirements.txt     # Python 의존성
├── .env.example        # 환경변수 예시
└── README.md           # 문서
```

### 프로덕션 배포
```bash
# Gunicorn 사용
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```


## 📝 로그

서버는 상세한 로그를 출력하여 디버깅을 지원합니다:
- 요약 요청 수신
- OpenAI API 호출
- 이메일 발송 결과
- 오류 상황


##📝 회의 요약

###🎯 주요 논의 사항
- (주요 논의된 내용들을 요점 정리)

###✅ 결정된 사항
- (회의에서 결정된 사항들)

###📋 액션 아이템
- (후속 조치가 필요한 사항들)

###🔧 STT 결과 개선사항
- (STT에서 잘못 인식된 부분이 있다면 수정사항 제시)