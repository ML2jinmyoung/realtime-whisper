#!/usr/bin/env python3
"""
Python 기본 HTTP 서버 - 라이브러리 의존성 최소화
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import urllib.parse
import logging

# .env 파일 로드
load_dotenv()

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

def call_openai_api(transcript: str, language: str) -> str:
    """OpenAI API 직접 호출"""
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise Exception("OPENAI_API_KEY가 설정되지 않았습니다")
    
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {openai_api_key}"
    }
    
    prompt = get_korean_prompt() if language == "korean" else "Summarize this meeting transcript:"
    
    payload = {
        "model": "gpt-4o",
        "messages": [
            {
                "role": "system",
                "content": "You are a professional meeting summarizer."
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
        raise Exception(f"OpenAI API 오류: {response.text}")

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
        <html>
        <body>
            <h1>🎯 AI 회의 요약 결과</h1>
            <div style="white-space: pre-wrap; font-family: monospace;">
{summary}
            </div>
            <hr>
            <p style="font-size: 12px; color: #666;">
                이 요약은 AI(OpenAI GPT-4)를 통해 자동 생성되었습니다.
            </p>
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

class RequestHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers()

    def do_GET(self):
        if self.path == '/':
            self._set_headers()
            response = {"message": "STT 요약 서비스가 정상 동작 중입니다", "status": "healthy"}
            self.wfile.write(json.dumps(response).encode())
        elif self.path == '/health':
            self._set_headers()
            openai_key = os.getenv("OPENAI_API_KEY")
            gmail_user = os.getenv("GMAIL_USER")
            gmail_pass = os.getenv("GMAIL_APP_PASSWORD")
            
            response = {
                "status": "healthy",
                "openai_configured": bool(openai_key),
                "gmail_configured": bool(gmail_user and gmail_pass)
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not Found"}).encode())

    def do_POST(self):
        if self.path == '/api/summarize':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                request_data = json.loads(post_data.decode('utf-8'))
                
                transcript = request_data.get('transcript', '')
                language = request_data.get('language', 'korean')
                email = request_data.get('email', '')
                meeting_info = request_data.get('meetingInfo', {})
                
                logger.info(f"📝 요약 요청 수신 - 언어: {language}, 이메일: {email}")
                
                if not transcript or len(transcript) < 10:
                    self._set_headers(400)
                    self.wfile.write(json.dumps({"error": "텍스트가 너무 짧습니다"}).encode())
                    return
                
                # OpenAI API로 요약 생성
                summary = call_openai_api(transcript, language)
                
                # 이메일 발송
                email_sent = False
                if email and email.strip():
                    email_sent = send_email(email.strip(), summary, meeting_info)
                
                logger.info(f"✅ 요약 처리 완료 - 이메일 발송: {email_sent}")
                
                self._set_headers()
                response = {
                    "success": True,
                    "summary": summary,
                    "emailSent": email_sent
                }
                self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))
                
            except Exception as e:
                logger.error(f"❌ 요약 처리 실패: {e}")
                self._set_headers(500)
                error_response = {
                    "success": False,
                    "error": str(e)
                }
                self.wfile.write(json.dumps(error_response).encode())
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not Found"}).encode())

    def log_message(self, format, *args):
        # 기본 로그 메시지 비활성화
        pass

if __name__ == "__main__":
    server_address = ('', 8000)
    httpd = HTTPServer(server_address, RequestHandler)
    
    print("🚀 HTTP 서버 시작 - http://localhost:8000")
    print("📋 사용 가능한 엔드포인트:")
    print("  GET  /          - 헬스 체크")
    print("  GET  /health    - 상세 상태 확인")
    print("  POST /api/summarize - STT 요약 및 메일 발송")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 서버 종료")
        httpd.shutdown()