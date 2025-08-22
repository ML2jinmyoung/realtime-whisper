# 백엔드 API 구현 예시

## 엔드포인트: POST /api/summarize

### 요청 형식
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
  },
  "prompt": "프롬프트 텍스트..."
}
```

### 응답 형식
```json
{
  "success": true,
  "summary": "## 📝 회의 요약\n\n### 🎯 주요 논의 사항\n...",
  "correctedTranscript": "수정된 전체 텍스트...",
  "emailSent": true
}
```

## 구현 예시 (Node.js + Express)

```javascript
const express = require('express');
const nodemailer = require('nodemailer');
const OpenAI = require('openai');

const app = express();
app.use(express.json({ limit: '10mb' }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const transporter = nodemailer.createTransporter({
  // 메일 서비스 설정
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

app.post('/api/summarize', async (req, res) => {
  try {
    const { transcript, language, email, meetingInfo, prompt } = req.body;

    // 1. LLM으로 요약 생성
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional meeting summarizer."
        },
        {
          role: "user",
          content: prompt + "\n\n" + transcript
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });

    const summary = completion.choices[0].message.content;

    // 2. 메일 발송
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: `회의 요약 - ${meetingInfo.date}`,
      html: `
        <h2>회의 요약</h2>
        <p><strong>날짜:</strong> ${meetingInfo.date}</p>
        <p><strong>시작 시간:</strong> ${meetingInfo.startTime}</p>
        <p><strong>녹음 시간:</strong> ${meetingInfo.duration}</p>
        <p><strong>세그먼트 수:</strong> ${meetingInfo.segmentCount}개</p>
        
        <hr>
        
        <div style="white-space: pre-wrap; font-family: monospace;">
          ${summary.replace(/\n/g, '<br>')}
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    // 3. 응답
    res.json({
      success: true,
      summary,
      emailSent: true
    });

  } catch (error) {
    console.error('요약 처리 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3001, () => {
  console.log('요약 서버가 3001 포트에서 실행 중...');
});
```

## 환경변수 설정 (.env)
```
OPENAI_API_KEY=your_openai_api_key
GMAIL_USER=your_gmail@gmail.com
GMAIL_PASS=your_app_password
```

## 대안 LLM 서비스
- OpenAI GPT-4
- Anthropic Claude
- Google Gemini
- 로컬 LLM (Ollama 등)