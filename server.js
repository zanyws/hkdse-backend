import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { createRequire } from 'module'
import 'dotenv/config'
import { createClerkClient } from '@clerk/clerk-sdk-node'
import { saveWorksheetRecord, getWorkSheetsByUser } from './supabaseClient.js'

const require = createRequire(import.meta.url)
const app = express()
const PORT = process.env.PORT || 3001

// Initialize Clerk
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

app.use(cors({
  origin: [
    'https://zanyws.github.io',
    'https://zanywr.pages.dev',
    'https://easyur.pages.dev',
    'http://localhost:5173',
    'http://localhost:4173',
  ]
}))
app.use(express.json({ limit: '20mb' }))

// File upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'text/plain']
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('不支援的檔案格式'))
  }
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// ── AI Proxy ────────────────────────────────────────────────────
// Forwards AI API requests from browser to avoid regional restrictions
// The browser sends the API key; this server only forwards the request
app.post('/api/ai-proxy', async (req, res) => {
  const { url, method = 'POST', headers = {}, body } = req.body

  if (!url) {
    return res.status(400).json({ error: '缺少 url 參數' })
  }

  // Security: only allow known AI API domains
  const allowedDomains = [
    'generativelanguage.googleapis.com',
    'api.openai.com',
    'api.anthropic.com',
    'api.groq.com',
  ]
  const isAllowed = allowedDomains.some(domain => url.includes(domain))
  if (!isAllowed) {
    return res.status(403).json({ error: '不允許的 API 域名' })
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (e) {
    console.error('AI proxy error:', e)
    res.status(500).json({ error: e.message || 'AI 代理請求失敗' })
  }
})

// ── Save generated worksheet session to Supabase ───────────────────
app.post('/api/save-worksheet', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '缺少認證 token' })
    }
    const token = authHeader.substring(7) // Remove 'Bearer '

    // Verify Clerk token
    const payload = await clerkClient.verifyToken(token)
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: '無效的認證 token' })
    }
    const userId = payload.sub

    const payloadData = req.body
    if (!payloadData || !payloadData.pageId || !payloadData.response) {
      return res.status(400).json({ error: '缺少要儲存的頁面或結果資料' })
    }

    const record = {
      userId,
      title: payloadData.title || null,
      author: payloadData.author || null,
      dynasty: payloadData.dynasty || null,
      provider: payloadData.provider || null,
      model: payloadData.model || null,
      pageId: payloadData.pageId,
      pageName: payloadData.pageName || null,
      prompt: payloadData.prompt || null,
      response: payloadData.response,
      worksheetData: payloadData.worksheetData || null,
      metadata: payloadData.metadata || null,
    }

    const data = await saveWorksheetRecord(record)
    res.json({ ok: true, data })
  } catch (e) {
    console.error('Save worksheet error:', e)
    res.status(500).json({ error: e.message || '無法儲存雲端資料' })
  }
})

app.get('/api/worksheets', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '缺少認證 token' })
    }
    const token = authHeader.substring(7)

    const payload = await clerkClient.verifyToken(token)
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: '無效的認證 token' })
    }
    const userId = payload.sub

    const data = await getWorkSheetsByUser(userId)
    res.json({ ok: true, data })
  } catch (e) {
    console.error('Fetch worksheets error:', e)
    res.status(500).json({ error: e.message || '無法取得雲端資料' })
  }
})

// ── Trial API (server-side Gemini key) ──────────────────────────
app.post('/api/trial', async (req, res) => {
  // Verify Clerk token
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '請先登入才能使用試用 API' })
    }
    const token = authHeader.substring(7)
    const payload = await clerkClient.verifyToken(token)
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: '無效的認證 token' })
    }
  } catch (e) {
    return res.status(401).json({ error: '認證失敗：' + e.message })
  }

  const apiKey = process.env.TRIAL_GEMINI_API_KEY
  const model  = process.env.TRIAL_GEMINI_MODEL || 'gemini-2.0-flash'

  if (!apiKey) {
    return res.status(503).json({ error: '試用 API 暫未開放，請自行設定 API Key' })
  }

  const { systemPrompt, userPrompt, maxTokens = 65536 } = req.body
  if (!userPrompt) {
    return res.status(400).json({ error: '缺少 userPrompt' })
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt }]
        }],
        generationConfig: {
          maxOutputTokens: Math.min(maxTokens, 65536),
          temperature: 0.3,
        },
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      const msg = data?.error?.message || `Gemini HTTP ${response.status}`
      return res.status(response.status).json({ error: msg })
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    res.json({ ok: true, text, model })
  } catch (e) {
    console.error('Trial API error:', e)
    res.status(500).json({ error: e.message || '試用 API 請求失敗' })
  }
})

// ── Trial OCR (server-side Gemini key for PDF/image) ────────────
app.post('/api/trial-ocr', async (req, res) => {
  // Verify Clerk token
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '請先登入才能使用試用 API' })
    }
    const token = authHeader.substring(7)
    const payload = await clerkClient.verifyToken(token)
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: '無效的認證 token' })
    }
  } catch (e) {
    return res.status(401).json({ error: '認證失敗：' + e.message })
  }

  const apiKey = process.env.TRIAL_GEMINI_API_KEY
  const model  = process.env.TRIAL_GEMINI_MODEL || 'gemini-2.0-flash'

  if (!apiKey) {
    return res.status(503).json({ error: '試用 API 暫未開放' })
  }

  const { base64Data, mimeType } = req.body
  if (!base64Data || !mimeType) {
    return res.status(400).json({ error: '缺少 base64Data 或 mimeType' })
  }

  const prompt = `請提取以下文件中的篇章正文內容。
要求：
1. 只提取文章的正文內容，不包括頁碼、頁眉、頁腳、目錄、題目要求、注釋、評語等非正文內容
2. 若文件是文言文篇章，只提取文言文原文，不包括白話翻譯或分析
3. 保持原有段落分隔
4. 只輸出文字內容，不加任何說明或標籤
5. 繁體中文輸出
6. 按原文順序輸出`

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Data } },
            { text: prompt }
          ]
        }],
        generationConfig: { maxOutputTokens: 8000, temperature: 0.1 },
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      const msg = data?.error?.message || `Gemini HTTP ${response.status}`
      return res.status(response.status).json({ error: msg })
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!text) return res.status(500).json({ error: '未能提取文字，請手動貼上原文' })
    res.json({ ok: true, text: text.trim() })
  } catch (e) {
    console.error('Trial OCR error:', e)
    res.status(500).json({ error: e.message || 'OCR 失敗' })
  }
})

// ── PDF/Image OCR ────────────────────────────────────────────────
app.post('/api/ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '請上傳檔案' })

    const { mimetype, buffer } = req.file
    let text = ''

    if (mimetype === 'text/plain') {
      text = buffer.toString('utf-8')
    } else if (mimetype === 'application/pdf') {
      try {
        const pdfParse = require('pdf-parse')
        const data = await pdfParse(buffer)
        text = data.text
      } catch (e) {
        return res.status(500).json({ error: 'PDF解析失敗，請嘗試手動貼上文字' })
      }
    } else {
      const base64 = buffer.toString('base64')
      return res.json({ type: 'image', base64, mimeType: mimetype })
    }

    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    res.json({ type: 'text', text, length: text.length })
  } catch (e) {
    console.error('OCR error:', e)
    res.status(500).json({ error: e.message || 'OCR處理失敗' })
  }
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: err.message || '伺服器錯誤' })
})

app.listen(PORT, () => {
  console.log(`🚀 後端服務啟動於 http://localhost:${PORT}`)
})
