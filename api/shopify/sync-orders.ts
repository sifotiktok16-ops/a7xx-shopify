import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '../../lib/crypto.js'

export const config = {
  runtime: 'nodejs20.x',
  maxDuration: 60,
}

function getSupabaseSafe() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01'

function validateStoreUrl(url: string): boolean {
  return /^https:\/\/[a-zA-Z0-9\-]+\.myshopify\.com$/.test(url.replace(/\/$/, ''))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { user_id, cursor, sync_log_id } = req.body || {}
    const mode = (req.query?.mode as string) === 'manual' ? 'manual' : 'auto'

    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' })
    }

    const supabase = getSupabaseSafe()
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase environment variables' })
    }

    // 1. Get Connection
    const { data: connection, error: connError } = await supabase
      .from('shopify_connections')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .single()

    if (connError || !connection) {
      return res.status(400).json({ error: 'No active Shopify connection found' })
    }

    const storeUrl = (connection.store_url as string).replace(/\/$/, '')
    const accessToken = await decrypt(connection.encrypted_access_token)

    // 2. Manage Sync Log (Start or Continue)
    let currentLogId = sync_log_id

    if (!cursor && !currentLogId) {
      // START NEW SYNC
      // Check if another is running (optional locking, but good for safety)
      // For now, we'll just create a new one
      const { data: newLog, error: logError } = await supabase
        .from('sync_logs')
        .insert({
          connection_id: connection.id,
          sync_type: `orders:${mode}`,
          status: 'in_progress',
          items_processed: 0,
          started_at: new Date().toISOString(),
          created_by: user_id,
        })
        .select()
        .single()

      if (logError) throw new Error('Failed to create sync log')
      currentLogId = newLog.id
    }

    // 3. Prepare Shopify Request (One Page Only)
    const params = new URLSearchParams()
    params.append('limit', '250') // Max limit

    // If cursor exists, use it (Shopify Relay Cursor)
    if (cursor) {
      params.append('page_info', cursor)
    } else {
      // First page filters
      params.append('status', 'any')
      if (mode === 'auto' && connection.last_sync_at) {
        params.append('updated_at_min', connection.last_sync_at)
        params.append('order', 'updated_at asc')
      }
    }

    const url = `${storeUrl}/admin/api/${apiVersion}/orders.json?${params.toString()}`

    // 4. Fetch from Shopify
    const shopifyResp = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (!shopifyResp.ok) {
      if (shopifyResp.status === 429) {
        return res.status(429).json({ error: 'Shopify API rate limit exceeded. Retry later.' })
      }
      const text = await shopifyResp.text()
      throw new Error(`Shopify API error ${shopifyResp.status}: ${text}`)
    }

    const data: any = await shopifyResp.json()
    const orders = data.orders || []

    // 5. Upsert to Supabase
    let newItemsCount = 0
    if (orders.length > 0) {
      const rows = orders.map((o: any) => ({
        connection_id: connection.id,
        order_id: String(o.id),
        shopify_order_id: String(o.id),
        total_price: o.total_price ? parseFloat(o.total_price) : 0,
        currency: o.currency || 'USD',
        customer_email: o.email || o.customer?.email || null,
        financial_status: o.financial_status || null,
        fulfillment_status: o.fulfillment_status || 'unfulfilled',
        order_date: o.created_at,
        customer: o.customer || null,
        line_items: Array.isArray(o.line_items) ? o.line_items : [],
      }))

      const { error: upsertError } = await supabase
        .from('orders')
        .upsert(rows, {
          onConflict: 'connection_id,order_id',
          ignoreDuplicates: false
        })

      if (upsertError) {
        // Log failure
        await supabase.from('sync_logs').update({
          status: 'error',
          error_message: upsertError.message,
          completed_at: new Date().toISOString()
        }).eq('id', currentLogId)

        throw new Error(`DB Upsert failed: ${upsertError.message}`)
      }

      newItemsCount = rows.length
    }

    // 6. Check Pagination (Link Header)
    const linkHeader = shopifyResp.headers.get('link')
    let nextCursor = null
    if (linkHeader) {
      const nextLink = linkHeader.split(',').find((p) => p.includes('rel="next"'))
      if (nextLink) {
        const match = nextLink.match(/page_info=([^&>]+)/)
        if (match) {
          nextCursor = match[1].replace(/"/g, '') // Clean quotes just in case
        }
      }
    }

    // 7. Update Sync Log
    // We increment items_processed atomically if possible, or read-modify-write. 
    // Ideally use a Postgres function `increment`, but standard update is fine for low concurrency.
    // Fetch current count to be safe or just add locally if we trust the flow.
    // Better: Just update the log with "last active" and maybe cumulative count if we passed it?
    // Let's just read-update for simplicity.

    if (currentLogId) {
      const { data: currentLog } = await supabase
        .from('sync_logs')
        .select('items_processed')
        .eq('id', currentLogId)
        .single()

      const totalProcessed = (currentLog?.items_processed || 0) + newItemsCount
      const status = nextCursor ? 'in_progress' : 'success'
      const completedAt = nextCursor ? null : new Date().toISOString()

      await supabase
        .from('sync_logs')
        .update({
          items_processed: totalProcessed,
          status: status,
          completed_at: completedAt,
          cursor_state: nextCursor || null // Save cursor state for resume
        })
        .eq('id', currentLogId)
    }

    // 8. Update Last Sync (Only if finished)
    if (!nextCursor) {
      await supabase
        .from('shopify_connections')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', connection.id)
    }

    return res.status(200).json({
      success: true,
      processed: newItemsCount,
      next_cursor: nextCursor,
      sync_log_id: currentLogId, // Client must pass this back
      has_more: !!nextCursor
    })

  } catch (err: any) {
    console.error('sync-orders error:', err)
    return res.status(500).json({ error: err?.message || 'Internal server error' })
  }
}
