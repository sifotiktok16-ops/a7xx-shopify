import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { CheckCircle, AlertCircle, Link2, Package, Loader2, Info, ArrowRight } from 'lucide-react'

import { AutoSyncService } from '@/services/autoSync'

export default function Setup() {
  const [storeUrl, setStoreUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const { getUserId } = useAuthStore()
  const navigate = useNavigate()

  const steps = [
    { id: 1, title: 'Store URL', description: 'Enter your Shopify store URL' },
    { id: 2, title: 'API Credentials', description: 'Enter your Admin API credentials' },
    { id: 3, title: 'Connection', description: 'Test and save your connection' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const uid = getUserId()
      if (!uid) {
        throw new Error('You must be logged in to connect a store')
      }
      const payload = {
        store_url: storeUrl.trim(),
        api_key: apiKey.trim(),
        api_secret: apiSecret.trim(),
        access_token: accessToken.trim(),
        user_id: uid,
      }

      const response = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
        const message = result?.error || `Connection failed (${response.status})`
        setError(message)
        console.error('Connection failed:', message)
        return
      }

      setSuccess(true)

      // Trigger background sync
      // We don't await this blocking user navigation, but we show a small toast or just let it happen
      // Ideally show a "Syncing..." state
      try {
        // Use the robust recursive sync service
        AutoSyncService.triggerManualSync(uid).then(result => {
          if (result.success) console.log('Initial sync started successfully')
          else console.error('Initial sync failed to start', result.message)
        })
      } catch (e) {
        console.error('Failed to trigger background sync', e)
      }

      navigate('/dashboard')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const validateStoreUrl = (url: string) => {
    return /^https:\/\/[a-zA-Z0-9\-]+\.myshopify\.com$/.test(url.replace(/\/$/, ''))
  }

  const handleStoreUrlChange = (value: string) => {
    setStoreUrl(value)
    if (validateStoreUrl(value)) {
      setCurrentStep(2)
    } else {
      setCurrentStep(1)
    }
  }

  const handleCredentialsChange = () => {
    if (apiKey && apiSecret && accessToken) {
      setCurrentStep(3)
    } else {
      setCurrentStep(2)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${currentStep >= step.id
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-500'
                }`}>
                {step.id}
              </div>
              <div className="ml-3">
                <p className={`text-sm font-medium ${currentStep >= step.id ? 'text-blue-600' : 'text-gray-500'
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
          <h2 className="text-lg font-medium text-gray-900">Connect Shopify Store</h2>
          <p className="mt-1 text-sm text-gray-600">
            Connect your Shopify store using Admin API credentials to sync orders and products
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
          {/* Store URL */}
          <div>
            <label htmlFor="store-url" className="block text-sm font-medium text-gray-700">
              Store URL
            </label>
            <div className="mt-1">
              <input
                type="url"
                name="store-url"
                id="store-url"
                required
                className={`shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md ${storeUrl && !validateStoreUrl(storeUrl) ? 'border-red-300' : ''
                  }`}
                placeholder="https://yourstore.myshopify.com"
                value={storeUrl}
                onChange={(e) => handleStoreUrlChange(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Your Shopify store URL (e.g., https://yourstore.myshopify.com)
              </p>
              {storeUrl && !validateStoreUrl(storeUrl) && (
                <p className="mt-1 text-xs text-red-600">
                  Please enter a valid Shopify store URL
                </p>
              )}
            </div>
          </div>

          {/* Admin API Key */}
          <div>
            <label htmlFor="api-key" className="block text-sm font-medium text-gray-700">
              Admin API Key
            </label>
            <div className="mt-1">
              <input
                type="password"
                name="api-key"
                id="api-key"
                required
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Your Admin API key"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  handleCredentialsChange()
                }}
              />
              <p className="mt-1 text-xs text-gray-500">
                From Shopify Admin → Apps → Develop Apps → API Credentials
              </p>
            </div>
          </div>

          {/* Admin API Secret Key */}
          <div>
            <label htmlFor="api-secret" className="block text-sm font-medium text-gray-700">
              Admin API Secret Key
            </label>
            <div className="mt-1">
              <input
                type="password"
                name="api-secret"
                id="api-secret"
                required
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Your Admin API secret key"
                value={apiSecret}
                onChange={(e) => {
                  setApiSecret(e.target.value)
                  handleCredentialsChange()
                }}
              />
              <p className="mt-1 text-xs text-gray-500">
                From the same API credentials page
              </p>
            </div>
          </div>

          {/* Admin Access Token */}
          <div>
            <label htmlFor="access-token" className="block text-sm font-medium text-gray-700">
              Admin Access Token
            </label>
            <div className="mt-1">
              <input
                type="password"
                name="access-token"
                id="access-token"
                required
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Your Admin API access token"
                value={accessToken}
                onChange={(e) => {
                  setAccessToken(e.target.value)
                  handleCredentialsChange()
                }}
              />
              <p className="mt-1 text-xs text-gray-500">
                Generated from your custom app's Admin API access token
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
                  <h3 className="text-sm font-medium text-green-800">Connection Successful!</h3>
                  <div className="mt-2 text-sm text-green-700">
                    Your Shopify store has been connected successfully and all orders have been fetched.
                    Redirecting to your dashboard to view your data...
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || success || !validateStoreUrl(storeUrl) || !apiKey || !apiSecret || !accessToken}
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
            <h3 className="text-sm font-medium text-blue-800">How to get Admin API credentials</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p className="font-medium mb-2">1. Create a Custom App in Shopify Admin:</p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Go to <strong>Settings → Apps and sales channels</strong></li>
                <li>Click <strong>Develop apps</strong></li>
                <li>Click <strong>Create app</strong></li>
                <li>Enter app name and contact email</li>
              </ol>

              <p className="font-medium mb-2 mt-4">2. Configure Admin API access:</p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Go to <strong>API permissions</strong></li>
                <li>Under <strong>Admin API access scopes</strong>, select:</li>
                <li className="ml-6">• Read orders (orders:read)</li>
                <li className="ml-6">• Read products (products:read)</li>
                <li className="ml-6">• Read customers (customers:read)</li>
                <li>Click <strong>Save</strong></li>
              </ol>

              <p className="font-medium mb-2 mt-4">3. Install and get credentials:</p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>Click <strong>Install app</strong></li>
                <li>After installation, go to <strong>API credentials</strong></li>
                <li>Copy the <strong>Admin API key</strong>, <strong>Admin API secret key</strong>, and <strong>Admin API access token</strong></li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Package className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-gray-900">Secure Connection</h3>
              <p className="text-xs text-gray-500">Encrypted API credentials storage</p>
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
              <p className="text-xs text-gray-500">Automatic order synchronization</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-gray-900">Real-Time Data</h3>
              <p className="text-xs text-gray-500">Live order updates and analytics</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}