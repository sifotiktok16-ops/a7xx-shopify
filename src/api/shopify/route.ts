import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import crypto from 'crypto'

// Shopify Admin API version
const SHOPIFY_API_VERSION = '2024-01'

// Encrypt sensitive data
function encrypt(text: string): string {
  const algorithm = 'aes-256-cbc'
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY!, 'salt', 32)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

// Decrypt sensitive data
function decrypt(text: string): string {
  const algorithm = 'aes-256-cbc'
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY!, 'salt', 32)
  const textParts = text.split(':')
  const iv = Buffer.from(textParts.shift()!, 'hex')
  const encryptedText = textParts.join(':')
  const decipher = crypto.createDecipheriv(algorithm, key, iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// Validate Shopify store URL
function validateStoreURL(url: string): boolean {
  const shopifyDomainRegex = /^https:\/\/([a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com)\/?$/
  return shopifyDomainRegex.test(url)
}

// Test Shopify Admin API connection
async function testShopifyConnection(storeUrl: string, accessToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?limit=1`, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (response.ok) {
      return { success: true }
    } else if (response.status === 401) {
      return { success: false, error: 'Invalid access token' }
    } else if (response.status === 404) {
      return { success: false, error: 'Invalid store URL' }
    } else {
      return { success: false, error: `Shopify API error: ${response.status}` }
    }
  } catch (error) {
    return { success: false, error: 'Connection failed' }
  }
}

// POST /api/shopify/connect
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { store_url, api_key, api_secret, access_token } = body

    // Validate required fields
    if (!store_url || !api_key || !api_secret || !access_token) {
      return NextResponse.json(
        { error: 'All fields are required: store_url, api_key, api_secret, access_token' },
        { status: 400 }
      )
    }

    // Validate store URL format
    if (!validateStoreURL(store_url)) {
      return NextResponse.json(
        { error: 'Invalid store URL. Must be in format: https://yourstore.myshopify.com' },
        { status: 400 }
      )
    }

    // Test Shopify connection
    const connectionTest = await testShopifyConnection(store_url, access_token)
    if (!connectionTest.success) {
      return NextResponse.json(
        { error: connectionTest.error },
        { status: 400 }
      )
    }

    // Get user from session (you'll need to implement auth middleware)
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
    }

    // Encrypt sensitive credentials
    const encryptedApiKey = encrypt(api_key)
    const encryptedApiSecret = encrypt(api_secret)
    const encryptedAccessToken = encrypt(access_token)

    // Store credentials in database
    const { data: connection, error: dbError } = await supabase
      .from('shopify_connections')
      .upsert({
        user_id: user.id,
        store_url: store_url,
        api_key: encryptedApiKey,
        api_secret: encryptedApiSecret,
        access_token: encryptedAccessToken,
        is_active: true,
        connected_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to store connection' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Shopify store connected successfully',
      connection: {
        id: connection.id,
        store_url: connection.store_url,
        connected_at: connection.connected_at,
      }
    })

  } catch (error) {
    console.error('Shopify connection error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
