import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase env vars. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.')
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
})

export async function saveWorksheetRecord(record) {
  const payload = {
    user_id: record.userId || null,
    title: record.title || null,
    author: record.author || null,
    dynasty: record.dynasty || null,
    provider: record.provider || null,
    model: record.model || null,
    page_id: record.pageId || null,
    page_name: record.pageName || null,
    prompt: record.prompt || null,
    response: record.response || null,
    worksheet_data: record.worksheetData || null,
    // 將 textConfig 合併至 metadata JSONB 欄位，無需新增資料庫欄位
    metadata: record.textConfig
      ? { ...(record.metadata || {}), textConfig: record.textConfig }
      : (record.metadata || null),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin.from('ai_reading').insert(payload)
  if (error) {
    throw error
  }
  return data
}

export async function getWorkSheetsByUser(userId) {
  const { data, error } = await supabaseAdmin
    .from('ai_reading')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }
  return data
}
