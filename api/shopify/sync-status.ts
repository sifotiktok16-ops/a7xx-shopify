import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function getSupabaseSafe() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user_id = (req.query.user_id as string) || (req.body && (req.body as any).user_id)
    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' })
    }

    const supabase = getSupabaseSafe()
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase environment variables' })
    }

    // Get user's active connection
    const { data: connection, error: connError } = await supabase
      .from('shopify_connections')
      .select('id, last_sync_at')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .single()

    if (connError || !connection) {
      return res.status(200).json({
        last_sync_at: null,
        last_sync_mode: null,
        last_sync_status: 'idle',
        new_orders_count: 0,
        next_auto_sync_time: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
    }

    // Latest orders sync log
    const { data: logs } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('connection_id', connection.id)
      .like('sync_type', 'orders:%')
      .order('started_at', { ascending: false })
      .limit(1)

    const lastLog = logs && logs[0]
    const last_sync_mode = lastLog ? String(lastLog.sync_type || '').split(':')[1] || null : null
    const last_sync_status = lastLog ? lastLog.status || 'idle' : 'idle'
    const new_orders_count = lastLog ? (lastLog.items_processed || 0) : 0

    // Next auto sync time
    // Prefer last auto log if present; else use connection.last_sync_at; else now + 5m
    let referenceTime = Date.now()
    if (lastLog && String(lastLog.sync_type || '').includes('orders:auto')) {
      referenceTime = new Date(lastLog.started_at || Date.now()).getTime()
    } else if (connection.last_sync_at) {
      referenceTime = new Date(connection.last_sync_at).getTime()
    }
    const next_auto_sync_time = new Date(referenceTime + 5 * 60 * 1000).toISOString()

    return res.status(200).json({
      last_sync_at: connection.last_sync_at,
      last_sync_mode,
      last_sync_status,
      new_orders_count,
      next_auto_sync_time,
    })
  } catch (err: any) {
    console.error('sync-status error:', err)
    return res.status(500).json({ error: err?.message || 'Internal server error' })
  }
}
