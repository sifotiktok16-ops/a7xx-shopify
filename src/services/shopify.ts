import { supabase } from '@/lib/supabase'

export interface ShopifyOrder {
  id: string
  email: string
  total_price: string
  currency: string
  created_at: string
  financial_status: string
  fulfillment_status: string
  line_items: any[]
}

export interface ShopifyProduct {
  id: string
  title: string
  vendor: string
  product_type: string
  variants: any[]
  images: any[]
}

class ShopifyService {
  private accessToken: string | null = null
  private storeDomain: string | null = null

  async initialize(userId: string) {
    // Get the user's Shopify connection
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (!connection) {
      throw new Error('No active Shopify connection found')
    }

    this.accessToken = connection.access_token
    this.storeDomain = connection.store_url
  }

  private async makeRequest(endpoint: string, method: string = 'GET') {
    if (!this.accessToken || !this.storeDomain) {
      throw new Error('Shopify connection not initialized')
    }

    const url = `https://${this.storeDomain}/admin/api/2023-10/${endpoint}`
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Shopify API request failed:', error)
      throw error
    }
  }

  async testConnection(): Promise<{ success: boolean; storeName?: string }> {
    try {
      const shopData = await this.makeRequest('shop.json')
      return {
        success: true,
        storeName: shopData.shop.name,
      }
    } catch (error) {
      return {
        success: false,
      }
    }
  }

  async getOrders(limit: number = 50, sinceId?: string): Promise<ShopifyOrder[]> {
    let endpoint = `orders.json?limit=${limit}`
    if (sinceId) {
      endpoint += `&since_id=${sinceId}`
    }
    
    const data = await this.makeRequest(endpoint)
    return data.orders
  }

  async getProducts(limit: number = 50): Promise<ShopifyProduct[]> {
    const data = await this.makeRequest(`products.json?limit=${limit}`)
    return data.products
  }

  async syncOrdersToDatabase(userId: string) {
    try {
      const orders = await this.getOrders()
      
      // Get connection ID
      const { data: connection } = await supabase
        .from('shopify_connections')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (!connection) return

      // Transform and insert orders
      const ordersToInsert = orders.map(order => ({
        connection_id: connection.id,
        shopify_order_id: order.id,
        total_price: parseFloat(order.total_price),
        currency: order.currency,
        customer_email: order.email,
        fulfillment_status: order.fulfillment_status,
        order_date: order.created_at,
      }))

      // Insert orders in batches
      const { error } = await supabase
        .from('orders')
        .upsert(ordersToInsert, {
          onConflict: 'connection_id,shopify_order_id',
        })

      if (error) {
        console.error('Error syncing orders:', error)
      }

      return orders.length
    } catch (error) {
      console.error('Error syncing orders:', error)
      throw error
    }
  }

  async syncProductsToDatabase(userId: string) {
    try {
      const products = await this.getProducts()
      
      // Get connection ID
      const { data: connection } = await supabase
        .from('shopify_connections')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (!connection) return

      // Transform and insert products
      const productsToInsert = products.map(product => {
        const mainVariant = product.variants[0] || {}
        return {
          connection_id: connection.id,
          shopify_product_id: product.id,
          title: product.title,
          price: mainVariant.price ? parseFloat(mainVariant.price) : null,
          inventory_quantity: mainVariant.inventory_quantity || 0,
          updated_at: new Date().toISOString(),
        }
      })

      // Insert products in batches
      const { error } = await supabase
        .from('products')
        .upsert(productsToInsert, {
          onConflict: 'connection_id,shopify_product_id',
        })

      if (error) {
        console.error('Error syncing products:', error)
      }

      return products.length
    } catch (error) {
      console.error('Error syncing products:', error)
      throw error
    }
  }
}

export const shopifyService = new ShopifyService()