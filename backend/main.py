"""
FastAPI 백엔드 서버 - LLM 요약 및 메일 발송
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
from dotenv import load_dotenv
import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
import json

# .env 파일 로드
load_dotenv()

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="STT 요약 서비스", version="1.0.0")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI API 직접 호출을 위한 설정
OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

def call_openai_api(messages: list, model: str = "gpt-4o") -> str:
    """OpenAI API를 직접 HTTP 요청으로 호출"""
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise ValueError("OPENAI_API_KEY 환경변수가 설정되지 않았습니다")
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {openai_api_key}"
    }
    
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": 2000,
        "temperature": 0.3
    }
    
    try:
        response = requests.post(
            OPENAI_API_URL,
            headers=headers,
            json=payload,
            timeout=60
        )
        
        response.raise_for_status()
        result = response.json()
        
        return result["choices"][0]["message"]["content"]
        
    except requests.exceptions.RequestException as e:
        logger.error(f"OpenAI API 호출 실패: {e}")
        raise HTTPException(status_code=500, detail=f"OpenAI API 호출 실패: {str(e)}")
    except KeyError as e:
        logger.error(f"OpenAI API 응답 파싱 실패: {e}")
        raise HTTPException(status_code=500, detail=f"OpenAI API 응답 파싱 실패: {str(e)}")

# 데이터 모델
class MeetingInfo(BaseModel):
    date: str
    startTime: str
    duration: str
    segmentCount: int

class SummaryRequest(BaseModel):
    transcript: str
    language: str
    email: str
    meetingInfo: Optional[MeetingInfo] = None
    prompt: Optional[str] = None

class SummaryResponse(BaseModel):
    success: bool
    summary: Optional[str] = None
    correctedTranscript: Optional[str] = None
    emailSent: bool = False
    error: Optional[str] = None

def get_korean_prompt() -> str:
    """한국어 요약 프롬프트"""
    return """
당신은 전문적인 회의록 요약 전문가입니다. 주어진 STT 결과를 분석하고 요약해주세요.

다음과 같은 형식으로 요약해주세요:

##📝 회의 요약

###🎯 주요 논의 사항
- (주요 논의된 내용들을 요점 정리)


###🔧 STT 결과 개선사항
- (STT에서 잘못 인식된 부분이 있다면 수정사항 제시)

**주의사항:**
1. STT 결과에 오류가 있을 수 있으므로 문맥을 고려해 해석하세요
2. 중요한 숫자, 날짜, 이름 등은 정확히 파악하세요
3. 불필요한 추측은 하지 마세요
4. 한국어로 작성해주세요
"""

def get_english_prompt() -> str:
    """영어 요약 프롬프트"""
    return """
You are a professional meeting summarizer. Please analyze and summarize the given STT results.

Please format the summary as follows:

## 📝 Meeting Summary

### 🎯 Key Discussion Points
- (Main topics discussed)

### ✅ Decisions Made
- (Decisions reached during the meeting)

### 📋 Action Items
- (Follow-up tasks and responsibilities)

### 🔧 STT Corrections
- (Any corrections needed for STT misrecognitions)

**Guidelines:**
1. STT results may contain errors, so interpret based on context
2. Accurately identify important numbers, dates, names
3. Avoid unnecessary speculation
4. Write in English
"""

def generate_summary(transcript: str, language: str) -> str:
    """OpenAI API를 직접 호출하여 회의 요약 생성"""
    try:
        prompt = get_korean_prompt() if language == "korean" else get_english_prompt()
        
        messages = [
            {
                "role": "system",
                "content": "You are a professional meeting summarizer with expertise in correcting STT errors and creating structured summaries."
            },
            {
                "role": "user", 
                "content": f"{prompt}\n\n**회의 내용:**\n{transcript}"
            }
        ]
        
        return call_openai_api(messages)
        
    except Exception as e:
        logger.error(f"OpenAI 요약 생성 실패: {e}")
        raise HTTPException(status_code=500, detail=f"요약 생성 실패: {str(e)}")

def send_email(email: str, summary: str, meeting_info: Optional[MeetingInfo] = None) -> bool:
    """이메일 발송"""
    try:
        # Gmail SMTP 설정
        smtp_server = "smtp.gmail.com"
        smtp_port = 587
        sender_email = os.getenv("GMAIL_USER")
        sender_password = os.getenv("GMAIL_APP_PASSWORD")
        
        if not sender_email or not sender_password:
            raise ValueError("Gmail 인증 정보가 설정되지 않았습니다")
        
        # 이메일 메시지 구성
        message = MIMEMultipart("alternative")
        message["Subject"] = f"📋 회의 요약 - {meeting_info.date if meeting_info else '오늘'}"
        message["From"] = sender_email
        message["To"] = email
        
        # HTML 본문 생성
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
                .header {{ background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }}
                .content {{ padding: 20px; }}
                .summary {{ background: #fff; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; }}
                h1, h2, h3 {{ color: #2d3748; }}
                .meta-info {{ background: #e3f2fd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎯 AI 회의 요약 결과</h1>
                <p>STT 결과를 분석하여 자동으로 생성된 회의 요약입니다.</p>
            </div>
            
            {f'''
            <div class="meta-info">
                <h3>📅 회의 정보</h3>
                <p><strong>날짜:</strong> {meeting_info.date}</p>
                <p><strong>시작 시간:</strong> {meeting_info.startTime}</p>
                <p><strong>녹음 시간:</strong> {meeting_info.duration}</p>
            </div>
            ''' if meeting_info else ''}
            
            <div class="content">
                <div class="summary">
                    <div style="white-space: pre-wrap; font-family: inherit;">
{summary.replace('<', '&lt;').replace('>', '&gt;')}
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 5px; font-size: 12px; color: #6c757d;">
                <p>이 요약은 AI(OpenAI GPT-4)를 통해 자동 생성되었습니다. 내용을 검토하시고 필요시 수정해 주세요.</p>
                <p>생성 시간: {meeting_info.date if meeting_info else '오늘'}</p>
            </div>
        </body>
        </html>
        """
        
        html_part = MIMEText(html_content, "html", "utf-8")
        message.attach(html_part)
        
        # SMTP 서버 연결 및 이메일 발송
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(message)
        
        logger.info(f"이메일 발송 완료: {email}")
        return True
        
    except Exception as e:
        logger.error(f"이메일 발송 실패: {e}")
        raise HTTPException(status_code=500, detail=f"이메일 발송 실패: {str(e)}")

@app.get("/")
async def root():
    """헬스 체크"""
    return {"message": "STT 요약 서비스가 정상 동작 중입니다", "status": "healthy"}

@app.post("/api/summarize", response_model=SummaryResponse)
async def summarize_and_email(request: SummaryRequest):
    """STT 결과 요약 및 이메일 발송"""
    try:
        logger.info(f"요약 요청 수신 - 언어: {request.language}, 이메일: {request.email}")
        
        # 입력 검증
        if not request.transcript.strip():
            raise HTTPException(status_code=400, detail="요약할 텍스트가 비어있습니다")
        
        if len(request.transcript) < 10:
            raise HTTPException(status_code=400, detail="텍스트가 너무 짧습니다")
        
        # 요약 생성
        logger.info("OpenAI 요약 생성 시작")
        summary = generate_summary(request.transcript, request.language)
        
        # 이메일 발송
        logger.info("이메일 발송 시작")
        email_sent = send_email(request.email, summary, request.meetingInfo)
        
        return SummaryResponse(
            success=True,
            summary=summary,
            emailSent=email_sent
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"요약 처리 실패: {e}")
        return SummaryResponse(
            success=False,
            error=str(e),
            emailSent=False
        )

@app.get("/health")
async def health_check():
    """상세 헬스 체크"""
    openai_key = os.getenv("OPENAI_API_KEY")
    gmail_user = os.getenv("GMAIL_USER") 
    gmail_pass = os.getenv("GMAIL_APP_PASSWORD")
    
    health_status = {
        "status": "healthy",
        "openai_configured": bool(openai_key),
        "openai_key_length": len(openai_key) if openai_key else 0,
        "gmail_configured": bool(gmail_user and gmail_pass),
        "gmail_user": gmail_user[:10] + "..." if gmail_user else None,
        "env_file_loaded": True
    }
    
    if not health_status["openai_configured"]:
        health_status["warnings"] = health_status.get("warnings", []) + ["OpenAI API 키가 설정되지 않음"]
    
    if not health_status["gmail_configured"]:
        health_status["warnings"] = health_status.get("warnings", []) + ["Gmail 인증 정보가 설정되지 않음"]
    
    return health_status

@app.post("/test-openai")
async def test_openai():
    """OpenAI API 테스트 엔드포인트"""
    try:
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            return {"success": False, "error": "OpenAI API 키가 설정되지 않음"}
        
        # 간단한 테스트 메시지로 OpenAI API 호출
        messages = [
            {
                "role": "user",
                "content": "간단히 '테스트 성공'이라고 답해주세요."
            }
        ]
        
        result = call_openai_api(messages)
        
        return {
            "success": True,
            "message": "OpenAI API 호출 성공",
            "response": result
        }
        
    except Exception as e:
        logger.error(f"OpenAI API 테스트 실패: {e}")
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)