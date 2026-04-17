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
    metadata: record.metadata || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin.from('ai_sessions').insert(payload)
  if (error) {
    throw error
  }
  return data
}
