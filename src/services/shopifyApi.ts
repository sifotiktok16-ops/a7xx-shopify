import { supabase } from '@/lib/supabase'

// Connect Shopify store via backend API route
export async function connectShopify(credentials: {
  store_url: string
  api_key: string
  api_secret: string
  access_token: string
}, userId: string): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    const response = await fetch('/api/shopify/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials, user_id: userId }),
    })
    const raw = await response.text()
    let result: any
    try {
      result = JSON.parse(raw)
    } catch {
      const ct = response.headers.get('content-type') || 'unknown'
      const snippet = raw ? raw.slice(0, 200) : ''
      result = { success: false, error: `Invalid server response (${response.status}, ${ct}) ${snippet}` }
    }
    if (!response.ok || !result?.success) {
      return { success: false, error: result?.error || `Connection failed (${response.status})` }
    }
    return { success: true, data: result?.data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
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
