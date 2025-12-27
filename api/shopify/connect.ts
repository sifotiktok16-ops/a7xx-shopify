import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { encrypt } from '../../lib/crypto.js'

export const config = {
  runtime: 'nodejs20.x',
  maxDuration: 10, // Use default 10s to match Hobby plan
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

function getBaseUrl(): string {
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return `https://${vercelUrl}`
  return process.env.LOCAL_DEV_URL || 'http://localhost:3000'
}

// Validate and normalize Shopify store URL
function normalizeStoreUrl(url: string): string {
  // Remove trailing slash
  let cleanUrl = url.trim().replace(/\/$/, '')

  // Remove existing protocol
  cleanUrl = cleanUrl.replace(/^https?:\/\//, '')

  // Enforce https:// prefix
  let finalUrl = `https://${cleanUrl}`

  // Validate format: https://yourstore.myshopify.com
  const validFormat = /^https:\/\/[a-zA-Z0-9\-]+\.myshopify\.com$/
  if (!validFormat.test(finalUrl)) {
    throw new Error('Invalid Shopify store URL format. Expected format: https://yourstore.myshopify.com')
  }

  return finalUrl
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Verify environment variables early
    if (!process.env.ENCRYPTION_KEY) {
      console.error('Missing ENCRYPTION_KEY')
      return res.status(500).json({ error: 'Server misconfiguration: Missing encryption key' })
    }

    // Parse JSON body and validate required fields
    const { store_url, api_key, api_secret, access_token, user_id } = req.body

    // Check user_id specifically
    if (!user_id || typeof user_id !== 'string' || user_id.trim() === '') {
      return res.status(400).json({ error: "Missing or invalid user_id" })
    }

    // Validate all required fields
    if (!store_url || !api_key || !api_secret || !access_token) {
      return res.status(400).json({ error: 'Missing required fields: store_url, api_key, api_secret, access_token' })
    }

    // Normalize store URL (no throws leak)
    let finalStoreUrl: string
    try {
      finalStoreUrl = normalizeStoreUrl(store_url)
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || 'Invalid Shopify store URL format' })
    }

    // Test Shopify Admin API connection
    const testUrl = `${finalStoreUrl}/admin/api/${apiVersion}/shop.json`
    let shopResponse

    try {
      // Create a timeout promise (Reduced to 7s to be safe within typical 10s lambda limit)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout - Shopify API took too long')), 7000)
      })

      // Race between fetch and timeout
      shopResponse = await Promise.race([
        fetch(testUrl, {
          method: 'GET',
          headers: {
            'X-Shopify-Access-Token': access_token,
            'Content-Type': 'application/json',
          },
        }),
        timeoutPromise
      ]) as any // Type assertion since Promise.race changes the type
    } catch (fetchError) {
      console.error('Shopify API fetch error:', fetchError)
      const msg = fetchError instanceof Error ? fetchError.message : 'Unknown network error'
      return res.status(400).json({ error: `Failed to connect to Shopify API: ${msg}` })
    }

    if (!shopResponse.ok) {
      let errorText
      try {
        errorText = await shopResponse.text()
      } catch {
        errorText = 'Unknown error'
      }
      return res.status(400).json({ error: `Shopify API error ${shopResponse.status}: ${errorText}` })
    }

    // Verify the response contains valid shop data
    let shopData
    try {
      shopData = await shopResponse.json()
    } catch (jsonError) {
      console.error('Failed to parse Shopify API response:', jsonError)
      return res.status(400).json({ error: 'Invalid JSON response from Shopify API' })
    }

    if (!shopData.shop) {
      return res.status(400).json({ error: 'Invalid response from Shopify API: missing shop data' })
    }

    const supabase = getSupabaseSafe()
    if (!supabase) {
      return res.status(500).json({ error: 'Missing Supabase environment variables' })
    }
    // Upsert Shopify connection in Supabase

    const { error: dbError } = await supabase
      .from('shopify_connections')
      .upsert({
        user_id: user_id.trim(),
        store_url: finalStoreUrl,
        encrypted_api_key: await encrypt(api_key.trim()),
        encrypted_api_secret: await encrypt(api_secret.trim()),
        encrypted_access_token: await encrypt(access_token.trim()),
        is_active: true,
        connected_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      return res.status(500).json({ error: 'Failed to save Shopify connection to database' })
    }

    // IMPORTANT: We do NOT sync orders here synchronously anymore to avoid Vercel timeouts.
    // The frontend will trigger the sync api specifically after a successful connection.

    // Return success response
    return res.status(200).json({ success: true, autoSynced: false })

  } catch (error) {
    console.error('Shopify connect error:', error)

    // Always return valid JSON, never HTML or undefined
    let errorMessage = 'Internal server error'
    if (error instanceof Error) {
      errorMessage = error.message
    }

    return res.status(500).json({ error: errorMessage })
  }
}
