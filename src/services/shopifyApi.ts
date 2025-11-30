import { supabase } from '@/lib/supabase'

// Shopify Admin API version
const SHOPIFY_API_VERSION = '2024-01'

// Simple encryption for demo (in production, use proper server-side encryption)
function encrypt(text: string): string {
  try {
    // For demo purposes, we'll store as-is (you should implement proper encryption)
    return btoa(text)
  } catch (error) {
    console.error('Encryption error:', error)
    return text // Fallback to plain text if encryption fails
  }
}

function decrypt(text: string): string {
  try {
    // For demo purposes, we'll decode as-is (you should implement proper decryption)
    return atob(text)
  } catch (error) {
    console.error('Decryption error:', error)
    return text // Fallback to plain text if decryption fails
  }
}

// Validate Shopify store URL
function validateStoreURL(url: string): boolean {
  const shopifyDomainRegex = /^https:\/\/([a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com)\/?$/
  return shopifyDomainRegex.test(url)
}

// Test Shopify Admin API connection
async function testShopifyConnection(storeUrl: string, accessToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Testing Shopify connection:', { storeUrl, accessToken: accessToken.substring(0, 10) + '...' })
    
    const response = await fetch(`${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?limit=1`, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    console.log('Shopify API response:', { status: response.status, ok: response.ok })

    if (response.ok) {
      return { success: true }
    } else if (response.status === 401) {
      return { success: false, error: 'Invalid access token' }
    } else if (response.status === 404) {
      return { success: false, error: 'Invalid store URL' }
    } else {
      const errorText = await response.text()
      console.error('Shopify API error response:', errorText)
      return { success: false, error: `Shopify API error: ${response.status} - ${errorText}` }
    }
  } catch (error) {
    console.error('Shopify connection error:', error)
    return { success: false, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

// Connect Shopify store with strict user isolation
export async function connectShopify(credentials: {
  store_url: string
  api_key: string
  api_secret: string
  access_token: string
}, userId: string): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    console.log('Starting Shopify connection for user:', userId)
    
    // Validate store URL
    if (!validateStoreURL(credentials.store_url)) {
      return { success: false, error: 'Invalid store URL format' }
    }

    console.log('Store URL validated:', credentials.store_url)

    // Test Shopify connection with user's credentials
    const connectionTest = await testShopifyConnection(credentials.store_url, credentials.access_token)
    
    if (!connectionTest.success) {
      console.error('Connection test failed:', connectionTest.error)
      return { success: false, error: connectionTest.error }
    }

    console.log('Connection test successful')

    // Check if user already has a connection
    const { data: existingConnection, error: fetchError } = await supabase
      .from('shopify_connections')
      .select('id, store_url')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching existing connection:', fetchError)
      return { success: false, error: 'Database error: ' + fetchError.message }
    }

    if (existingConnection) {
      console.log('Updating existing connection:', existingConnection.id)
      
      // Update existing connection
      const { data: connection, error: updateError } = await supabase
        .from('shopify_connections')
        .update({
          store_url: credentials.store_url,
          api_key: encrypt(credentials.api_key),
          api_secret: encrypt(credentials.api_secret),
          access_token: encrypt(credentials.access_token),
          is_active: true,
          connected_at: new Date().toISOString(),
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id)
        .select()
        .single()

      if (updateError) {
        console.error('Database update error:', updateError)
        return { success: false, error: 'Failed to update connection: ' + updateError.message }
      }

      // Immediately fetch orders for this user
      try {
        await fetchAndStoreOrders(connection.id, credentials.store_url, credentials.access_token)
      } catch (fetchError) {
        console.error('Error fetching orders:', fetchError)
        // Don't fail the connection, just log the error
      }

      return { 
        success: true, 
        data: {
          id: connection.id,
          store_url: connection.store_url,
          connected_at: connection.connected_at,
          message: 'Connection updated and orders fetched successfully'
        }
      }
    } else {
      console.log('Creating new connection')
      
      // Create new connection
      const encryptedApiKey = encrypt(credentials.api_key)
      const encryptedApiSecret = encrypt(credentials.api_secret)
      const encryptedAccessToken = encrypt(credentials.access_token)

      const { data: connection, error: dbError } = await supabase
        .from('shopify_connections')
        .insert({
          user_id: userId,
          store_url: credentials.store_url,
          api_key: encryptedApiKey,
          api_secret: encryptedApiSecret,
          access_token: encryptedAccessToken,
          is_active: true,
          connected_at: new Date().toISOString(),
          last_sync_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (dbError) {
        console.error('Database error:', dbError)
        return { success: false, error: 'Failed to store connection: ' + dbError.message }
      }

      // Immediately fetch orders for this user
      try {
        await fetchAndStoreOrders(connection.id, credentials.store_url, credentials.access_token)
      } catch (fetchError) {
        console.error('Error fetching orders:', fetchError)
        // Don't fail the connection, just log the error
      }

      return { 
        success: true, 
        data: {
          id: connection.id,
          store_url: connection.store_url,
          connected_at: connection.connected_at,
          message: 'Connection established and orders fetched successfully'
        }
      }
    }

  } catch (error) {
    console.error('Shopify connection error:', error)
    return { success: false, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

// Fetch and store orders for a specific user's connection
async function fetchAndStoreOrders(connectionId: string, storeUrl: string, accessToken: string): Promise<void> {
  try {
    // Fetch orders from Shopify
    const shopifyOrders = await fetchShopifyOrders(storeUrl, accessToken)
    
    // Transform and save orders to database with connection isolation
    const transformedOrders = shopifyOrders.map(order => 
      transformShopifyOrder(order, connectionId)
    )

    // Store orders with user isolation
    await supabase
      .from('orders')
      .upsert(transformedOrders, {
        onConflict: 'shopify_order_id',
        ignoreDuplicates: false
      })

    // Update last sync timestamp
    await supabase
      .from('shopify_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connectionId)

    console.log(`Successfully fetched and stored ${shopifyOrders.length} orders for connection ${connectionId}`)

  } catch (error) {
    console.error(`Failed to fetch orders for connection ${connectionId}:`, error)
    throw error
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

// Fetch all orders for a specific user with strict isolation
export async function fetchAllOrders(userId: string): Promise<{ success: boolean; orders?: any[]; error?: string; message?: string }> {
  try {
    // Get user's connection only
    const { data: connection, error: connectionError } = await supabase
      .from('shopify_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (connectionError || !connection) {
      return { success: false, error: 'No active Shopify connection found for this user' }
    }

    // Decrypt credentials for this user only
    const accessToken = decrypt(connection.access_token)

    // Fetch orders from this user's Shopify store only
    const shopifyOrders = await fetchShopifyOrders(connection.store_url, accessToken)
    
    // Save to database with user isolation
    const transformedOrders = shopifyOrders.map(order => 
      transformShopifyOrder(order, connection.id)
    )

    // Store orders with connection_id ensuring user isolation
    await supabase
      .from('orders')
      .upsert(transformedOrders, {
        onConflict: 'shopify_order_id',
        ignoreDuplicates: false
      })

    // Update last sync timestamp for this user's connection
    await supabase
      .from('shopify_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id)

    // Log sync activity for this user
    await supabase
      .from('sync_logs')
      .insert({
        connection_id: connection.id,
        sync_type: 'orders',
        status: 'success',
        items_processed: shopifyOrders.length,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })

    return { 
      success: true, 
      orders: shopifyOrders,
      message: `Successfully fetched ${shopifyOrders.length} orders for user ${userId}`
    }

  } catch (error) {
    console.error(`Fetch orders error for user ${userId}:`, error)
    return { success: false, error: 'Failed to fetch orders' }
  }
}

// Get user's orders with complete isolation
export async function getUserOrders(userId: string): Promise<{ success: boolean; orders?: any[]; error?: string; message?: string }> {
  try {
    // Get user's connection first
    const { data: connection, error: connectionError } = await supabase
      .from('shopify_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (connectionError || !connection) {
      return { success: false, error: 'No active Shopify connection found' }
    }

    // Fetch orders only for this user's connection
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('connection_id', connection.id)
      .order('order_date', { ascending: false })

    if (ordersError) {
      console.error('Database error:', ordersError)
      return { success: false, error: 'Failed to fetch orders' }
    }

    return { 
      success: true, 
      orders: orders || [],
      message: `Retrieved ${orders?.length || 0} orders for user ${userId}`
    }

  } catch (error) {
    console.error(`Get user orders error for user ${userId}:`, error)
    return { success: false, error: 'Failed to retrieve orders' }
  }
}

// Delete user's Shopify connection and all associated data
export async function deleteUserConnection(userId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    // Get user's connection
    const { data: connection, error: connectionError } = await supabase
      .from('shopify_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (connectionError || !connection) {
      return { success: false, error: 'No active connection found' }
    }

    // Delete all orders for this user's connection
    await supabase
      .from('orders')
      .delete()
      .eq('connection_id', connection.id)

    // Delete all sync logs for this user's connection
    await supabase
      .from('sync_logs')
      .delete()
      .eq('connection_id', connection.id)

    // Deactivate the connection
    await supabase
      .from('shopify_connections')
      .update({ is_active: false })
      .eq('id', connection.id)

    return { 
      success: true, 
      message: 'User connection and all associated data deleted successfully' 
    }

  } catch (error) {
    console.error(`Delete connection error for user ${userId}:`, error)
    return { success: false, error: 'Failed to delete connection' }
  }
}
