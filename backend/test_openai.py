#!/usr/bin/env python3
"""
OpenAI API 직접 테스트 스크립트
"""

import os
import requests
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

def test_openai_api():
    """OpenAI API 직접 호출 테스트"""
    
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        print("❌ OPENAI_API_KEY 환경변수가 설정되지 않았습니다")
        return False
    
    print(f"✅ OpenAI API 키 설정됨 (길이: {len(openai_api_key)})")
    
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
        "max_tokens": 50,
        "temperature": 0.1
    }
    
    try:
        print("🚀 OpenAI API 호출 시작...")
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        print(f"📡 응답 상태 코드: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            print(f"✅ OpenAI API 응답: {content}")
            return True
        else:
            print(f"❌ OpenAI API 오류: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 예외 발생: {str(e)}")
        return False

if __name__ == "__main__":
    print("=== OpenAI API 테스트 시작 ===")
    success = test_openai_api()
    
    if success:
        print("🎉 OpenAI API 테스트 성공!")
    else:
        print("💥 OpenAI API 테스트 실패!")