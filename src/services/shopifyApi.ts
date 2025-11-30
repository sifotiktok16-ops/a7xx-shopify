import { supabase } from '@/lib/supabase'

// Shopify Admin API version
const SHOPIFY_API_VERSION = '2024-01'

// Simple encryption for demo (in production, use proper server-side encryption)
function encrypt(text: string): string {
  // For demo purposes, we'll store as-is (you should implement proper encryption)
  return btoa(text)
}

function decrypt(text: string): string {
  // For demo purposes, we'll decode as-is (you should implement proper decryption)
  return atob(text)
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

// Connect Shopify store
export async function connectShopify(credentials: {
  store_url: string
  api_key: string
  api_secret: string
  access_token: string
}, userId: string): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    // Validate store URL
    if (!validateStoreURL(credentials.store_url)) {
      return { success: false, error: 'Invalid store URL format' }
    }

    // Test Shopify connection
    const connectionTest = await testShopifyConnection(credentials.store_url, credentials.access_token)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error }
    }

    // Encrypt credentials (simple encoding for demo)
    const encryptedApiKey = encrypt(credentials.api_key)
    const encryptedApiSecret = encrypt(credentials.api_secret)
    const encryptedAccessToken = encrypt(credentials.access_token)

    // Store credentials in database
    const { data: connection, error: dbError } = await supabase
      .from('shopify_connections')
      .upsert({
        user_id: userId,
        store_url: credentials.store_url,
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
      return { success: false, error: 'Failed to store connection' }
    }

    return { 
      success: true, 
      data: {
        id: connection.id,
        store_url: connection.store_url,
        connected_at: connection.connected_at,
      }
    }

  } catch (error) {
    console.error('Shopify connection error:', error)
    return { success: false, error: 'Connection failed' }
  }
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

// Fetch all orders for a user
export async function fetchAllOrders(userId: string): Promise<{ success: boolean; orders?: any[]; error?: string }> {
  try {
    // Get user's connection
    const { data: connection, error: connectionError } = await supabase
      .from('shopify_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (connectionError || !connection) {
      return { success: false, error: 'No active Shopify connection found' }
    }

    // Decrypt credentials
    const accessToken = decrypt(connection.access_token)

    // Fetch orders from Shopify
    const shopifyOrders = await fetchShopifyOrders(connection.store_url, accessToken)
    
    // Save to database
    const transformedOrders = shopifyOrders.map(order => 
      transformShopifyOrder(order, connection.id)
    )

    await supabase
      .from('orders')
      .upsert(transformedOrders, {
        onConflict: 'shopify_order_id',
        ignoreDuplicates: false
      })

    return { success: true, orders: shopifyOrders }

  } catch (error) {
    console.error('Fetch orders error:', error)
    return { success: false, error: 'Failed to fetch orders' }
  }
}
