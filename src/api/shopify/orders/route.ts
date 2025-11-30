import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import crypto from 'crypto'

// Shopify Admin API version
const SHOPIFY_API_VERSION = '2024-01'

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

// Fetch orders from Shopify with pagination
async function fetchShopifyOrders(storeUrl: string, accessToken: string): Promise<any[]> {
  const allOrders: any[] = []
  let pageInfo: { hasNextPage?: boolean; endCursor?: string } = { hasNextPage: true }
  
  while (pageInfo.hasNextPage) {
    const url = pageInfo.endCursor 
      ? `${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=250&page_info=${pageInfo.endCursor}`
      : `${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=250`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`)
    }

    const data = await response.json()
    const orders = data.orders || []
    allOrders.push(...orders)

    // Parse link header for pagination
    const linkHeader = response.headers.get('link')
    if (linkHeader) {
      const nextLink = linkHeader.split(',').find((link: string) => link.includes('rel="next"'))
      if (nextLink) {
        const match = nextLink.match(/page_info=([^>]+)/)
        if (match) {
          pageInfo.endCursor = match[1].replace('"', '')
        } else {
          pageInfo.hasNextPage = false
        }
      } else {
        pageInfo.hasNextPage = false
      }
    } else {
      pageInfo.hasNextPage = false
    }
  }

  return allOrders
}

// Transform Shopify order to our database format
function transformShopifyOrder(shopifyOrder: any, connectionId: string): any {
  return {
    connection_id: connectionId,
    shopify_order_id: shopifyOrder.id.toString(),
    order_number: shopifyOrder.order_number,
    email: shopifyOrder.email || shopifyOrder.customer?.email,
    total_price: shopifyOrder.total_price,
    subtotal_price: shopifyOrder.subtotal_price,
    total_tax: shopifyOrder.total_tax,
    currency: shopifyOrder.currency,
    financial_status: shopifyOrder.financial_status,
    fulfillment_status: shopifyOrder.fulfillment_status || 'unfulfilled',
    order_date: shopifyOrder.created_at,
    customer_name: shopifyOrder.customer 
      ? `${shopifyOrder.customer.first_name || ''} ${shopifyOrder.customer.last_name || ''}`.trim()
      : 'Guest',
    shipping_address: shopifyOrder.shipping_address 
      ? JSON.stringify(shopifyOrder.shipping_address)
      : null,
    billing_address: shopifyOrder.billing_address 
      ? JSON.stringify(shopifyOrder.billing_address)
      : null,
    line_items_data: JSON.stringify(shopifyOrder.line_items || []),
    updated_at: shopifyOrder.updated_at,
  }
}

// GET /api/shopify/orders
export async function GET(request: NextRequest) {
  try {
    // Get user from session
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
    }

    // Get user's Shopify connection
    const { data: connection, error: connectionError } = await supabase
      .from('shopify_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (connectionError || !connection) {
      return NextResponse.json(
        { error: 'No active Shopify connection found' },
        { status: 404 }
      )
    }

    // Decrypt credentials
    const accessToken = decrypt(connection.access_token)

    // Fetch all orders from Shopify
    const shopifyOrders = await fetchShopifyOrders(connection.store_url, accessToken)

    // Transform and save orders to database
    const transformedOrders = shopifyOrders.map(order => 
      transformShopifyOrder(order, connection.id)
    )

    // Upsert orders to database (update existing, insert new)
    const { data: savedOrders, error: saveError } = await supabase
      .from('orders')
      .upsert(transformedOrders, {
        onConflict: 'shopify_order_id',
        ignoreDuplicates: false
      })
      .select()

    if (saveError) {
      console.error('Database save error:', saveError)
      // Still return the orders even if save fails
    }

    return NextResponse.json({
      success: true,
      message: `Successfully fetched ${shopifyOrders.length} orders`,
      orders: shopifyOrders,
      saved_count: savedOrders?.length || 0,
    })

  } catch (error) {
    console.error('Fetch orders error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}
