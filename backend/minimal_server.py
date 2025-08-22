"""
최소한의 FastAPI 서버 - 문제 진단용
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import requests
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "서버가 정상 작동 중입니다"}

@app.get("/test")
def test():
    return {"message": "테스트 성공"}

@app.post("/test-requests")
def test_requests():
    """requests 라이브러리 테스트"""
    try:
        # 간단한 HTTP 요청 테스트
        response = requests.get("https://httpbin.org/get", timeout=10)
        return {
            "success": True,
            "status_code": response.status_code,
            "message": "requests 라이브러리 정상 작동"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "type": str(type(e))
        }

@app.post("/test-openai-simple")
def test_openai_simple():
    """OpenAI API 직접 호출 테스트"""
    try:
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key:
            return {"success": False, "error": "API 키가 설정되지 않음"}
        
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {openai_api_key}"
        }
        
        payload = {
            "model": "gpt-4o",
            "messages": [
                {
                    "role": "user",
                    "content": "간단히 '테스트 성공'이라고 답해주세요."
                }
            ],
            "max_tokens": 50
        }
        
        print("🚀 OpenAI API 호출 시작...")
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        print(f"📡 응답 상태: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            print(f"✅ OpenAI 응답: {content}")
            return {
                "success": True,
                "response": content,
                "status_code": response.status_code
            }
        else:
            print(f"❌ OpenAI 오류: {response.text}")
            return {
                "success": False,
                "error": response.text,
                "status_code": response.status_code
            }
            
    except Exception as e:
        print(f"❌ 예외 발생: {str(e)}")
        print(f"예외 타입: {type(e)}")
        import traceback
        print(f"스택 트레이스: {traceback.format_exc()}")
        return {
            "success": False,
            "error": str(e),
            "type": str(type(e))
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("minimal_server:app", host="0.0.0.0", port=8001, reload=True)