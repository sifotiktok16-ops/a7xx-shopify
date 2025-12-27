import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const req = _req
  const secret = process.env.CRON_SECRET || ''

  // POST only: this endpoint is triggered by an external scheduler
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Accept secret from body, headers, or query for flexibility
  const tokenFromBodyUpper = (req.body && (req.body as any).CRON_SECRET) || ''
  const tokenFromBodyLower = (req.body && (req.body as any).cron_token) || ''
  const tokenFromHeader1 = (req.headers['x-cron-token'] as string) || ''
  const tokenFromHeader2 = (req.headers['x-cron-secret'] as string) || ''
  const tokenFromHeader3 = (req.headers['cron_secret'] as string) || ''
  const tokenFromQuery = (req.query && (req.query as any).cron_token) || ''
  const provided = String(tokenFromBodyUpper || tokenFromBodyLower || tokenFromHeader1 || tokenFromHeader2 || tokenFromHeader3 || tokenFromQuery || '')
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized cron access' })
  }

  try {
    const started_at = new Date().toISOString()
    // Load all active connections
    const { data: connections, error } = await supabase
      .from('shopify_connections')
      .select('user_id')
      .eq('is_active', true)

    if (error) {
      console.error('sync-cron: failed to load connections', error)
      return res.status(500).json({ error: 'Failed to load connections' })
    }

    const uniqueUsers = Array.from(new Set((connections || []).map((c: any) => c.user_id)))
    const base = `https://${req.headers.host || process.env.VERCEL_URL}`

    // Trigger full sync per user (orders manual + products)
    let totalOrders = 0
    let totalProducts = 0
    const results = await Promise.all(uniqueUsers.map(async (user_id) => {
      let okOrders = false
      let okProducts = false
      let ordersItems = 0
      let productsItems = 0
      try {
        const r1 = await fetch(`${base}/api/shopify/sync-orders?mode=manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id }),
        })
        const j1: any = await r1.json().catch(() => ({ success: false, items_processed: 0 }))
        okOrders = r1.ok && !!j1?.success
        ordersItems = Number(j1?.items_processed || 0)
        if (okOrders) totalOrders += ordersItems
      } catch (e: any) {
        console.error('sync-cron: orders sync failed', user_id, e)
      }
      try {
        const r2 = await fetch(`${base}/api/shopify/sync-products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id }),
        })
        const j2: any = await r2.json().catch(() => ({ success: false, items_processed: 0 }))
        okProducts = r2.ok && !!j2?.success
        productsItems = Number(j2?.items_processed || 0)
        if (okProducts) totalProducts += productsItems
      } catch (e: any) {
        console.error('sync-cron: products sync failed', user_id, e)
      }
      return { user_id, orders: { ok: okOrders, items_processed: ordersItems }, products: { ok: okProducts, items_processed: productsItems } }
    }))

    const completed_at = new Date().toISOString()
    return res.status(200).json({ 
      success: true,
      users_processed: results.length,
      orders_synced: totalOrders,
      products_synced: totalProducts,
      started_at,
      completed_at,
      statuses: results,
    })
  } catch (err: any) {
    console.error('sync-cron error:', err)
    return res.status(500).json({ error: err?.message || 'Internal server error' })
  }
}
