# HKDSE 中文科閱讀工作紙生成平台——後端

AI 代理服務，用於轉發 API 請求，解決香港地區限制。

## 部署到 Render

1. 連接此 GitHub repo
2. Build Command：留空
3. Start Command：`node server.js`
4. 環境變數：不需要（API Key 由前端提供）

## 端點

- `GET /health` — 健康檢查
- `POST /api/ai-proxy` — AI API 代理
- `POST /api/ocr` — PDF/圖片 OCR
