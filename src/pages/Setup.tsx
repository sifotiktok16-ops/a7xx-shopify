import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { apiService } from '@/services/api'
import { CheckCircle, AlertCircle, Store, Link2, Loader2, Info, ArrowRight } from 'lucide-react'

export default function Setup() {
  const [storeUrl, setStoreUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Validate store URL format
      if (!storeUrl.includes('.myshopify.com')) {
        throw new Error('Please enter a valid Shopify store URL (e.g., yourstore.myshopify.com)')
      }

      // Test Shopify connection
      const result = await apiService.testShopifyConnection({
        storeUrl,
        apiKey,
        apiSecret,
      })

      if (!result.connected) {
        throw new Error(result.error || 'Failed to connect to Shopify store. Please check your credentials.')
      }

      // Save connection to database
      const { error: dbError } = await supabase
        .from('shopify_connections')
        .insert({
          user_id: user?.id,
          store_url: storeUrl,
          access_token: `${apiKey}:${apiSecret}`, // Store as combined token
          store_name: result.storeName,
          is_active: true,
        })

      if (dbError) throw dbError

      setSuccess(true)
      setTimeout(() => {
        navigate('/dashboard')
      }, 2000)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const steps = [
    { id: 1, title: 'Store Information', description: 'Enter your Shopify store URL' },
    { id: 2, title: 'API Credentials', description: 'Provide your API key and secret' },
    { id: 3, title: 'Connection', description: 'Test and save your connection' },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                currentStep >= step.id
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-gray-500'
              }`}>
                {step.id}
              </div>
              <div className="ml-3">
                <p className={`text-sm font-medium ${
                  currentStep >= step.id ? 'text-blue-600' : 'text-gray-500'
                }`}>
                  {step.title}
                </p>
                <p className="text-xs text-gray-500">{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <ArrowRight className="mx-4 h-5 w-5 text-gray-400" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Connect Your Shopify Store</h2>
          <p className="mt-1 text-sm text-gray-600">
            Enter your Shopify store credentials to start syncing your data
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
          <div>
            <label htmlFor="store-url" className="block text-sm font-medium text-gray-700">
              Store URL
            </label>
            <div className="mt-1">
              <input
                type="text"
                name="store-url"
                id="store-url"
                required
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="yourstore.myshopify.com"
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Your Shopify store URL (must include .myshopify.com)
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="api-key" className="block text-sm font-medium text-gray-700">
              API Key
            </label>
            <div className="mt-1">
              <input
                type="password"
                name="api-key"
                id="api-key"
                required
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Your Shopify API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Your Shopify Admin API key
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="api-secret" className="block text-sm font-medium text-gray-700">
              API Secret
            </label>
            <div className="mt-1">
              <input
                type="password"
                name="api-secret"
                id="api-secret"
                required
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Your Shopify API secret"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Your Shopify Admin API secret
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Connection Error</h3>
                  <div className="mt-2 text-sm text-red-700">{error}</div>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="flex">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">Success!</h3>
                  <div className="mt-2 text-sm text-green-700">
                    Your Shopify store has been connected successfully. Redirecting to dashboard...
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || success}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="-ml-1 mr-2 h-4 w-4" />
                  Connect Store
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 bg-blue-50 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <Info className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Need help finding your API credentials?</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>1. Log in to your Shopify admin panel</p>
              <p>2. Go to Settings → Apps and sales channels</p>
              <p>3. Click "Develop apps" or create a private app</p>
              <p>4. Generate API credentials with read access to orders and products</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Store className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-gray-900">Secure Connection</h3>
              <p className="text-xs text-gray-500">Your API keys are encrypted and stored securely</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link2 className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-gray-900">Auto-Sync</h3>
              <p className="text-xs text-gray-500">Orders and products sync automatically</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-gray-900">Real-time Data</h3>
              <p className="text-xs text-gray-500">Get instant insights into your store performance</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}