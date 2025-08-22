import { SummaryRequest, SummaryResponse } from '../types/llm';

// 백엔드 API 엔드포인트로 다시 변경
const LLM_API_ENDPOINT = process.env.REACT_APP_LLM_API_ENDPOINT || 'http://localhost:8000/api/summarize';

export class LLMService {
  static async summarizeAndEmail(request: SummaryRequest): Promise<SummaryResponse> {
    try {
      console.log('🤖 LLM 요약 및 메일 발송 요청:', {
        endpoint: LLM_API_ENDPOINT,
        textLength: request.transcriptText.length,
        language: request.language,
        email: request.email
      });

      // STT 결과를 백엔드 API에 요약 요청
      const response = await fetch(LLM_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: request.transcriptText,
          language: request.language,
          email: request.email,
          meetingInfo: request.meetingInfo,
          prompt: request.language === 'korean' 
            ? this.getKoreanPrompt()
            : this.getEnglishPrompt()
        }),
      });

      console.log('📡 API 응답 상태:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API 응답 오류:', {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          errorText
        });
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const result = await response.json();
      
      console.log('✅ LLM 요약 완료:', {
        success: result.success,
        summaryLength: result.summary?.length || 0,
        emailSent: result.emailSent
      });

      return result;

    } catch (error) {
      console.error('❌ LLM 요약 실패:', error);
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      
      return {
        success: false,
        error: `LLM 요약 실패: ${errorMessage}`
      };
    }
  }

  private static getKoreanPrompt(): string {
    return `
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

---

## 📄 수정된 회의록 전문
[보정된 전체 텍스트]

원본 STT 텍스트:
`;
  }

  private static getEnglishPrompt(): string {
    return `
The following is the original text converted from meeting audio via STT.
Please perform the following tasks:

1. STT Error Correction: Naturally correct obvious recognition errors or grammatical mistakes
2. Meeting Summary:
   - Key discussion points (3-5 core points)
   - Decisions made
   - Action items (with assignees and deadlines if mentioned)
   - Next meeting schedule or follow-up actions

Response format:
## 📝 Meeting Summary

### 🎯 Key Discussion Points
- Key point 1
- Key point 2
- ...

### ✅ Decisions Made
- Decided items

### 📋 Action Items
- [ ] Task description (assignee, deadline)
- [ ] Task description (assignee, deadline)

### 📅 Follow-up Actions
- Next meeting schedule, etc.

---

## 📄 Corrected Meeting Transcript
[Corrected full text]

Original STT Text:
`;
  }
}