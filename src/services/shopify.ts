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
  async initialize(_userId: string) {
    // Kept for backward compatibility, no-op
    return
  }

  // Read orders from Supabase for the given user
  async getOrdersFromDb(userId: string, limit: number = 50) {
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()
    if (!connection) return []
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('connection_id', connection.id)
      .order('order_date', { ascending: false })
      .limit(limit)
    return orders || []
  }

  // Read products from Supabase for the given user
  async getProductsFromDb(userId: string, limit: number = 50) {
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()
    if (!connection) return []
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('connection_id', connection.id)
      .order('updated_at', { ascending: false })
      .limit(limit)
    return products || []
  }

  // Trigger backend sync for orders
  async syncOrdersToDatabase(userId: string) {
    const resp = await fetch('/api/shopify/sync-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    const json = await resp.json().catch(() => ({ success: false }))
    if (!resp.ok || !json?.success) throw new Error(json?.error || `HTTP ${resp.status}`)
    return json.items_processed || 0
  }

  // Trigger backend sync for products
  async syncProductsToDatabase(userId: string) {
    const resp = await fetch('/api/shopify/sync-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    const json = await resp.json().catch(() => ({ success: false }))
    if (!resp.ok || !json?.success) throw new Error(json?.error || `HTTP ${resp.status}`)
    return json.items_processed || 0
  }
}

export const shopifyService = new ShopifyService()