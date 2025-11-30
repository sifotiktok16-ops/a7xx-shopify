import { supabase } from '@/lib/supabase'

export interface ShopifyCredentials {
  store_url: string
  api_key: string
  api_secret: string
  access_token: string
}

export interface ShopifyOrder {
  id: string
  order_number: number
  email?: string
  total_price: string
  subtotal_price: string
  total_tax: string
  currency: string
  financial_status: string
  fulfillment_status?: string
  created_at: string
  updated_at: string
  customer?: {
    first_name?: string
    last_name?: string
    email?: string
  }
  line_items: Array<{
    id: string
    product_id: string
    variant_id: string
    title: string
    quantity: number
    price: string
  }>
  shipping_address?: any
  billing_address?: any
}

export class ShopifyAdminService {
  private static readonly API_VERSION = '2024-01'

  // Connect Shopify store
  static async connect(credentials: ShopifyCredentials, userId: string): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      // Validate store URL
      if (!this.validateStoreURL(credentials.store_url)) {
        return { success: false, error: 'Invalid store URL format' }
      }

      // Test connection
      const testResult = await this.testConnection(credentials.store_url, credentials.access_token)
      if (!testResult.success) {
        return { success: false, error: testResult.error }
      }

      // Store encrypted credentials
      const encrypted = await this.encryptCredentials(credentials)
      
      const { data, error } = await supabase
        .from('shopify_connections')
        .upsert({
          user_id: userId,
          store_url: credentials.store_url,
          api_key: encrypted.api_key,
          api_secret: encrypted.api_secret,
          access_token: encrypted.access_token,
          is_active: true,
          connected_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        console.error('Database error:', error)
        return { success: false, error: 'Failed to store connection' }
      }

      return { 
        success: true, 
        data: {
          id: data.id,
          store_url: data.store_url,
          connected_at: data.connected_at,
        }
      }

    } catch (error) {
      console.error('Connection error:', error)
      return { success: false, error: 'Connection failed' }
    }
  }

  // Test Shopify Admin API connection
  static async testConnection(storeUrl: string, accessToken: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${storeUrl}/admin/api/${this.API_VERSION}/orders.json?limit=1`, {
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

  // Fetch all orders with pagination
  static async fetchAllOrders(userId: string): Promise<{ success: boolean; orders?: ShopifyOrder[]; error?: string }> {
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
      const credentials = await this.decryptCredentials(connection)
      
      // Fetch orders from Shopify
      const orders = await this.fetchOrdersWithPagination(credentials.store_url, credentials.access_token)
      
      // Save to database
      await this.saveOrdersToDatabase(orders, connection.id)

      return { success: true, orders }
    } catch (error) {
      console.error('Fetch orders error:', error)
      return { success: false, error: 'Failed to fetch orders' }
    }
  }

  // Fetch orders with pagination
  private static async fetchOrdersWithPagination(storeUrl: string, accessToken: string): Promise<ShopifyOrder[]> {
    const allOrders: ShopifyOrder[] = []
    let pageInfo: { hasNextPage?: boolean; endCursor?: string } = { hasNextPage: true }
    
    while (pageInfo.hasNextPage) {
      const url = pageInfo.endCursor 
        ? `${storeUrl}/admin/api/${this.API_VERSION}/orders.json?status=any&limit=250&page_info=${pageInfo.endCursor}`
        : `${storeUrl}/admin/api/${this.API_VERSION}/orders.json?status=any&limit=250`

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

  // Save orders to database
  private static async saveOrdersToDatabase(orders: ShopifyOrder[], connectionId: string): Promise<void> {
    const transformedOrders = orders.map(order => ({
      connection_id: connectionId,
      shopify_order_id: order.id.toString(),
      order_number: order.order_number,
      email: order.email || order.customer?.email,
      total_price: parseFloat(order.total_price),
      subtotal_price: parseFloat(order.subtotal_price),
      total_tax: parseFloat(order.total_tax),
      currency: order.currency,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status || 'unfulfilled',
      order_date: order.created_at,
      customer_name: order.customer 
        ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
        : 'Guest',
      shipping_address: order.shipping_address ? JSON.stringify(order.shipping_address) : null,
      billing_address: order.billing_address ? JSON.stringify(order.billing_address) : null,
      line_items_data: JSON.stringify(order.line_items || []),
      updated_at: order.updated_at,
    }))

    await supabase
      .from('orders')
      .upsert(transformedOrders, {
        onConflict: 'shopify_order_id',
        ignoreDuplicates: false
      })
  }

  // Validate store URL
  private static validateStoreURL(url: string): boolean {
    const shopifyDomainRegex = /^https:\/\/([a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com)\/?$/
    return shopifyDomainRegex.test(url)
  }

  // Encrypt credentials (client-side - in production, do this server-side)
  private static async encryptCredentials(credentials: ShopifyCredentials): Promise<Omit<ShopifyCredentials, 'store_url'>> {
    // In production, this should be done server-side
    // For now, we'll store as-is (you should implement proper encryption)
    return {
      api_key: credentials.api_key,
      api_secret: credentials.api_secret,
      access_token: credentials.access_token,
    }
  }

  // Decrypt credentials (client-side - in production, do this server-side)
  private static async decryptCredentials(connection: any): Promise<ShopifyCredentials> {
    // In production, this should be done server-side
    // For now, we'll return as-is (you should implement proper decryption)
    return {
      store_url: connection.store_url,
      api_key: connection.api_key,
      api_secret: connection.api_secret,
      access_token: connection.access_token,
    }
  }
}
