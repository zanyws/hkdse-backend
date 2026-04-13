import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { createRequire } from 'module'
import 'dotenv/config'

const require = createRequire(import.meta.url)
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: [
    'https://zanyws.github.io',
    'https://zanywr.pages.dev',
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
