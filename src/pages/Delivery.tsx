import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { CheckCircle, AlertCircle, Truck, Package, Loader2, Info, ArrowRight } from 'lucide-react'

export default function Delivery() {
  const [selectedService, setSelectedService] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const deliveryServices = [
    {
      id: 'fedex',
      name: 'FedEx',
      description: 'Reliable shipping with tracking',
      icon: Truck,
      color: 'purple'
    },
    {
      id: 'ups',
      name: 'UPS',
      description: 'Global shipping solutions',
      icon: Package,
      color: 'yellow'
    },
    {
      id: 'dhl',
      name: 'DHL',
      description: 'International shipping expert',
      icon: Truck,
      color: 'red'
    }
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!user) {
        throw new Error('You must be logged in to connect a delivery service')
      }
      if (!selectedService) {
        throw new Error('Please select a delivery service')
      }

      function encrypt(text: string): string {
        try { return btoa(text) } catch { return text }
      }

      const { error: dbError } = await supabase
        .from('delivery_connections')
        .insert({
          user_id: user.id,
          service_name: selectedService,
          api_key: encrypt(apiKey),
          api_secret: encrypt(apiSecret),
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
    { id: 1, title: 'Choose Service', description: 'Select your delivery provider' },
    { id: 2, title: 'API Credentials', description: 'Enter your API keys' },
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
          <h2 className="text-lg font-medium text-gray-900">Connect Delivery Service</h2>
          <p className="mt-1 text-sm text-gray-600">
            Choose and connect your preferred delivery service for automated shipping
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
          {/* Service Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-4">
              Select Delivery Service
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {deliveryServices.map((service) => (
                <div
                  key={service.id}
                  onClick={() => setSelectedService(service.id)}
                  className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${
                    selectedService === service.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <service.icon className={`h-8 w-8 ${
                      service.color === 'purple' ? 'text-purple-600' :
                      service.color === 'yellow' ? 'text-yellow-600' :
                      'text-red-600'
                    }`} />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-gray-900">{service.name}</h3>
                      <p className="text-xs text-gray-500">{service.description}</p>
                    </div>
                  </div>
                  {selectedService === service.id && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedService && (
            <>
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
                    placeholder={`Your ${selectedService.toUpperCase()} API key`}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Your {selectedService.toUpperCase()} API key
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
                    placeholder={`Your ${selectedService.toUpperCase()} API secret`}
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Your {selectedService.toUpperCase()} API secret
                  </p>
                </div>
              </div>
            </>
          )}

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
                    Your delivery service has been connected successfully. Redirecting to dashboard...
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || success || !selectedService}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                  Connecting...
                </>
              ) : (
                <>
                  <Truck className="-ml-1 mr-2 h-4 w-4" />
                  Connect Service
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
            <h3 className="text-sm font-medium text-blue-800">Delivery Integration Benefits</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>• Automated shipping label generation</p>
              <p>• Real-time tracking updates</p>
              <p>• Rate comparison and optimization</p>
              <p>• Seamless order fulfillment</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Truck className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-gray-900">Automated Dispatch</h3>
              <p className="text-xs text-gray-500">Orders automatically sent for delivery</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Package className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-gray-900">Smart Tracking</h3>
              <p className="text-xs text-gray-500">Real-time package tracking updates</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-gray-900">Cost Optimization</h3>
              <p className="text-xs text-gray-500">Best rates and delivery options</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
