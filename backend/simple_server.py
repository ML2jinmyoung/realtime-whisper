"""
간단한 Flask 서버로 OpenAI API 호출 테스트
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# .env 파일 로드
load_dotenv()

app = Flask(__name__)
CORS(app)

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

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
- ...

### ✅ 결정 사항
- 결정된 내용들

### 📋 액션 아이템
- [ ] 작업 내용 (담당자, 기한)
- [ ] 작업 내용 (담당자, 기한)

### 📅 후속 조치
- 다음 회의 일정 등

원본 STT 텍스트:
"""

def call_openai_api(transcript, language):
    """OpenAI API 직접 호출"""
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다")
    
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
    
    response = requests.post(OPENAI_API_URL, headers=headers, json=payload, timeout=60)
    response.raise_for_status()
    
    result = response.json()
    return result["choices"][0]["message"]["content"]

def send_email(email, summary, meeting_info=None):
    """Gmail로 이메일 발송"""
    try:
        smtp_server = "smtp.gmail.com"
        smtp_port = 587
        sender_email = os.getenv("GMAIL_USER")
        sender_password = os.getenv("GMAIL_APP_PASSWORD")
        
        if not sender_email or not sender_password:
            return False, "Gmail 인증 정보가 설정되지 않았습니다"
        
        message = MIMEMultipart("alternative")
        message["Subject"] = f"📋 회의 요약 - {meeting_info.get('date', '오늘') if meeting_info else '오늘'}"
        message["From"] = sender_email
        message["To"] = email
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
        </head>
        <body>
            <h2>🎯 AI 회의 요약 결과</h2>
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
        
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(message)
        
        return True, "메일 발송 완료"
        
    except Exception as e:
        return False, f"메일 발송 실패: {str(e)}"

@app.route('/')
def health():
    return {"status": "healthy", "message": "Flask 서버가 정상 동작 중입니다"}

@app.route('/api/summarize', methods=['POST'])
def summarize():
    try:
        data = request.json
        transcript = data.get('transcript', '')
        language = data.get('language', 'korean')
        email = data.get('email', '')
        meeting_info = data.get('meetingInfo', {})
        
        if not transcript or len(transcript) < 10:
            return jsonify({"success": False, "error": "텍스트가 너무 짧습니다"}), 400
        
        # OpenAI API 호출
        print(f"📝 요약 생성 시작 - 언어: {language}, 길이: {len(transcript)}")
        summary = call_openai_api(transcript, language)
        print(f"✅ 요약 생성 완료")
        
        # 이메일 발송
        if email:
            print(f"📧 이메일 발송 시작: {email}")
            email_success, email_message = send_email(email, summary, meeting_info)
            print(f"📧 이메일 발송 결과: {email_message}")
        else:
            email_success = False
            email_message = "이메일 주소가 제공되지 않음"
        
        return jsonify({
            "success": True,
            "summary": summary,
            "emailSent": email_success,
            "emailMessage": email_message
        })
        
    except Exception as e:
        print(f"❌ 오류 발생: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)