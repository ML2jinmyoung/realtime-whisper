"""
최종 작동하는 FastAPI 서버 - OpenAI + 이메일 기능 포함
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import logging

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

def get_korean_prompt():
    return """
다음은 회의 음성을 STT로 변환한 원본 텍스트입니다. 
아래 작업을 수행해주세요:

1. STT 오류 보정: 명백한 인식 오류나 문법 오류를 자연스럽게 수정
2. 회의 요약 작성: 
   - 주요 논의 사항 (3-5개 핵심 포인트)
   - 결정된 사항
   - 액션 아이템 (담당자와 기한 포함 시)
   - 다음 회의 일정이나 후속 조치

응답 형식:
## 📝 회의 요약

### 🎯 주요 논의 사항
- 핵심 포인트 1
- 핵심 포인트 2

### ✅ 결정 사항
- 결정된 내용들

### 📋 액션 아이템
- [ ] 작업 내용 (담당자, 기한)

### 📅 후속 조치
- 다음 회의 일정 등

원본 STT 텍스트:
"""

def get_english_prompt():
    return """
Please summarize this meeting transcript:

1. STT Error Correction: Fix obvious speech recognition errors
2. Meeting Summary:
   - Key discussion points (3-5 core points)
   - Decisions made
   - Action items (with assignees and deadlines)
   - Follow-up actions

Response format:
## 📝 Meeting Summary

### 🎯 Key Discussion Points
- Point 1
- Point 2

### ✅ Decisions Made
- Decided items

### 📋 Action Items
- [ ] Task (assignee, deadline)

### 📅 Follow-up Actions
- Next meeting schedule

Original STT Text:
"""

def call_openai_api(transcript: str, language: str) -> str:
    """OpenAI API 직접 호출 - 검증된 방식"""
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY가 설정되지 않았습니다")
    
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {openai_api_key}"
    }
    
    prompt = get_korean_prompt() if language == "korean" else get_english_prompt()
    
    payload = {
        "model": "gpt-4o",
        "messages": [
            {
                "role": "system",
                "content": "You are a professional meeting summarizer with expertise in correcting STT errors and creating structured summaries."
            },
            {
                "role": "user",
                "content": f"{prompt}\n\n{transcript}"
            }
        ],
        "max_tokens": 2000,
        "temperature": 0.3
    }
    
    logger.info("🚀 OpenAI API 호출 시작...")
    response = requests.post(url, headers=headers, json=payload, timeout=60)
    logger.info(f"📡 OpenAI 응답 상태: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        content = result["choices"][0]["message"]["content"]
        logger.info("✅ OpenAI 요약 생성 성공")
        return content
    else:
        logger.error(f"❌ OpenAI API 오류: {response.text}")
        raise HTTPException(status_code=500, detail=f"OpenAI API 오류: {response.text}")

def send_email(email: str, summary: str, meeting_info: dict = None) -> bool:
    """Gmail로 이메일 발송"""
    try:
        smtp_server = "smtp.gmail.com"
        smtp_port = 587
        sender_email = os.getenv("GMAIL_USER")
        sender_password = os.getenv("GMAIL_APP_PASSWORD")
        
        if not sender_email or not sender_password:
            logger.error("Gmail 인증 정보가 설정되지 않았습니다")
            return False
        
        message = MIMEMultipart("alternative")
        message["Subject"] = f"📋 회의 요약 - {meeting_info.get('date', '오늘') if meeting_info else '오늘'}"
        message["From"] = sender_email
        message["To"] = email
        
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
                <p><strong>날짜:</strong> {meeting_info["date"]}</p>
                <p><strong>시작 시간:</strong> {meeting_info.get("startTime", "")}</p>
                <p><strong>녹음 시간:</strong> {meeting_info.get("duration", "")}</p>
                <p><strong>세그먼트 수:</strong> {meeting_info.get("segmentCount", "")}개</p>
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
            </div>
        </body>
        </html>
        """
        
        html_part = MIMEText(html_content, "html", "utf-8")
        message.attach(html_part)
        
        logger.info("📧 이메일 발송 시작...")
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(message)
        
        logger.info(f"✅ 이메일 발송 완료: {email}")
        return True
        
    except Exception as e:
        logger.error(f"❌ 이메일 발송 실패: {e}")
        return False

@app.get("/")
def root():
    return {"message": "STT 요약 서비스가 정상 동작 중입니다", "status": "healthy"}

@app.get("/health")
def health_check():
    """상세 헬스 체크"""
    openai_key = os.getenv("OPENAI_API_KEY")
    gmail_user = os.getenv("GMAIL_USER") 
    gmail_pass = os.getenv("GMAIL_APP_PASSWORD")
    
    return {
        "status": "healthy",
        "openai_configured": bool(openai_key),
        "openai_key_length": len(openai_key) if openai_key else 0,
        "gmail_configured": bool(gmail_user and gmail_pass),
        "gmail_user": gmail_user[:10] + "..." if gmail_user else None
    }

@app.post("/api/summarize")
def summarize_and_email(request: dict):
    """STT 결과 요약 및 이메일 발송 - 메인 API"""
    try:
        transcript = request.get('transcript', '')
        language = request.get('language', 'korean')
        email = request.get('email', '')
        meeting_info = request.get('meetingInfo', {})
        
        logger.info(f"📝 요약 요청 수신 - 언어: {language}, 이메일: {email}, 텍스트 길이: {len(transcript)}")
        
        # 입력 검증
        if not transcript or len(transcript) < 10:
            raise HTTPException(status_code=400, detail="텍스트가 너무 짧습니다")
        
        # OpenAI API로 요약 생성
        summary = call_openai_api(transcript, language)
        
        # 이메일 발송
        email_sent = False
        if email and email.strip():
            email_sent = send_email(email.strip(), summary, meeting_info)
        
        logger.info(f"✅ 요약 처리 완료 - 이메일 발송: {email_sent}")
        
        return {
            "success": True,
            "summary": summary,
            "emailSent": email_sent
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 요약 처리 실패: {e}")
        import traceback
        logger.error(f"스택 트레이스: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"요약 처리 실패: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("working_server:app", host="0.0.0.0", port=8000, reload=True)