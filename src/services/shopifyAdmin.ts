import { connectShopify, fetchAllOrders } from './shopifyApi'

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
  // Connect Shopify store
  static async connect(credentials: ShopifyCredentials, userId: string): Promise<{ success: boolean; error?: string; data?: any }> {
    return await connectShopify(credentials, userId)
  }

  // Fetch all orders with pagination
  static async fetchAllOrders(userId: string): Promise<{ success: boolean; orders?: ShopifyOrder[]; error?: string }> {
    const result = await fetchAllOrders(userId)
    return result
  }
}
