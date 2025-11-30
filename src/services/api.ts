import { shopifyService } from './shopify'

export interface TestConnectionRequest {
  storeUrl: string
  apiKey: string
  apiSecret: string
}

export interface TestConnectionResponse {
  connected: boolean
  storeName?: string
  error?: string
}

export class ApiService {
  async testShopifyConnection(request: TestConnectionRequest): Promise<TestConnectionResponse> {
    try {
      // For demo purposes, we'll simulate a successful connection
      // In a real application, this would make an actual API call to Shopify
      
      // Validate the store URL format
      if (!request.storeUrl.includes('.myshopify.com')) {
        return {
          connected: false,
          error: 'Invalid store URL format. Must be in format: storename.myshopify.com'
        }
      }

      // Validate API key format (basic validation)
      if (request.apiKey.length < 10) {
        return {
          connected: false,
          error: 'API key appears to be invalid (too short)'
        }
      }

      if (request.apiSecret.length < 10) {
        return {
          connected: false,
          error: 'API secret appears to be invalid (too short)'
        }
      }

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // For demo, we'll extract the store name from the URL
      const storeName = request.storeUrl.replace('.myshopify.com', '').replace('https://', '').replace('http://', '')

      return {
        connected: true,
        storeName: storeName.charAt(0).toUpperCase() + storeName.slice(1) + ' Store'
      }
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      }
    }
  }

  async syncStoreData(userId: string): Promise<{ orders: number; products: number }> {
    try {
      // Initialize Shopify service
      await shopifyService.initialize(userId)

      // Sync orders
      const ordersSynced = await shopifyService.syncOrdersToDatabase(userId)

      // Sync products
      const productsSynced = await shopifyService.syncProductsToDatabase(userId)

      return {
        orders: ordersSynced,
        products: productsSynced
      }
    } catch (error) {
      console.error('Error syncing store data:', error)
      throw error
    }
  }
}

export const apiService = new ApiService()

// Mock API endpoints for development
export function setupMockApi() {
  // This would be replaced with actual API calls in a production environment
  if (typeof window !== 'undefined') {
    (window as any).testShopifyConnection = async (request: TestConnectionRequest) => {
      return apiService.testShopifyConnection(request)
    }
  }
}