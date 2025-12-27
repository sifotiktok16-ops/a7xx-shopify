import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '../../lib/crypto'

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

async function fetchAllShopifyProducts(storeUrl: string, accessToken: string): Promise<any[]> {
  const allProducts: any[] = []
  let nextPageInfo: string | null = null

  while (true) {
    const baseUrl = `${storeUrl}/admin/api/${apiVersion}/products.json?limit=250`
    const url = nextPageInfo ? `${baseUrl}&page_info=${encodeURIComponent(nextPageInfo)}` : baseUrl

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`Shopify API error ${resp.status}: ${text}`)
    }

    const data: any = await resp.json()
    const products = data.products || []
    allProducts.push(...products)

    const linkHeader = resp.headers.get('link')
    if (!linkHeader) break
    const nextLink = linkHeader.split(',').find((p) => p.includes('rel="next"'))
    if (!nextLink) break
    const match = nextLink.match(/page_info=([^&>]+)/)
    if (!match) break
    nextPageInfo = match[1].replace('"', '')
  }

  return allProducts
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { user_id } = req.body || {}
    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' })
    }

    // Load connection for this user only
    const supabase = getSupabaseSafe()
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase environment variables' })
    }
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
    if (!validateStoreUrl(storeUrl)) {
      return res.status(400).json({ error: 'Invalid Shopify store URL format' })
    }

    const accessToken = await decrypt(connection.encrypted_access_token)

    // Fetch products from Shopify
    const shopifyProducts = await fetchAllShopifyProducts(storeUrl, accessToken)

    // Transform products into DB schema
    const rows = shopifyProducts.map((p: any) => {
      const mainVariant = (p.variants && p.variants[0]) || {}
      return {
        connection_id: connection.id,
        // canonical id
        product_id: String(p.id),
        // legacy compatibility
        shopify_product_id: String(p.id),
        title: p.title,
        price: mainVariant.price ? parseFloat(mainVariant.price) : null,
        inventory_quantity: mainVariant.inventory_quantity || 0,
        images: Array.isArray(p.images) ? p.images : [],
        variants: Array.isArray(p.variants) ? p.variants : [],
        updated_at: new Date().toISOString(),
      }
    })

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from('products')
        .upsert(rows, { onConflict: 'connection_id,product_id', ignoreDuplicates: false })

      if (upsertError) {
        console.error('Upsert products error:', upsertError)
        return res.status(500).json({ error: 'Failed to upsert products' })
      }
    }

    return res.status(200).json({ success: true, items_processed: rows.length })
  } catch (err: any) {
    console.error('sync-products error:', err)
    return res.status(500).json({ error: err?.message || 'Internal server error' })
  }
}
