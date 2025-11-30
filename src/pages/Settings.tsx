import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { 
  Key, 
  Store, 
  User, 
  Trash2, 
  Copy, 
  Check, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react'

export default function Settings() {
  const { user } = useAuthStore()
  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [connection, setConnection] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [newKeyName, setNewKeyName] = useState('')
  const [showGenerateForm, setShowGenerateForm] = useState(false)

  useEffect(() => {
    fetchSettingsData()
  }, [])

  const fetchSettingsData = async () => {
    try {
      setLoading(true)
      
      // Fetch API keys
      const { data: keys } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })

      // Fetch Shopify connection
      const { data: conn } = await supabase
        .from('shopify_connections')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .single()

      setApiKeys(keys || [])
      setConnection(conn)
    } catch (error) {
      console.error('Error fetching settings data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateApiKey = async () => {
    if (!newKeyName.trim()) {
      alert('Please enter a name for the API key')
      return
    }

    try {
      // Generate a random API key
      const key = 'sk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      const keyHash = btoa(key) // Simple base64 encoding for demo

      const { error } = await supabase
        .from('api_keys')
        .insert({
          user_id: user?.id,
          key_hash: keyHash,
          name: newKeyName,
        })

      if (error) throw error

      setNewKeyName('')
      setShowGenerateForm(false)
      fetchSettingsData()
      
      // Show the key to the user (in a real app, this would be shown only once)
      alert(`API Key generated: ${key}\n\nPlease save this key securely as it won't be shown again.`)
    } catch (error) {
      alert('Error generating API key')
    }
  }

  const deleteApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return

    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId)

      if (error) throw error
      fetchSettingsData()
    } catch (error) {
      alert('Error deleting API key')
    }
  }

  const disconnectStore = async () => {
    if (!confirm('Are you sure you want to disconnect your Shopify store? This will remove all synced data.')) return

    try {
      const { error } = await supabase
        .from('shopify_connections')
        .update({ is_active: false })
        .eq('id', connection.id)

      if (error) throw error
      fetchSettingsData()
    } catch (error) {
      alert('Error disconnecting store')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(text)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Settings
          </h2>
        </div>
      </div>

      {/* Account Settings */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <User className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Account Information</h3>
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email Address</label>
              <p className="mt-1 text-sm text-gray-900">{user?.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Account Created</label>
              <p className="mt-1 text-sm text-gray-900">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Shopify Connection */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <Store className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Shopify Store Connection</h3>
          </div>
        </div>
        <div className="px-6 py-4">
          {loading ? (
            <div className="animate-pulse h-20 bg-gray-200 rounded"></div>
          ) : connection ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Connected Store</p>
                  <p className="text-sm text-gray-500">{connection.store_name || connection.store_url}</p>
                </div>
                <button
                  onClick={disconnectStore}
                  className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Disconnect
                </button>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <Check className="h-5 w-5 text-green-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-green-800">Connected</p>
                    <p className="text-sm text-green-700">Your store is successfully connected and syncing data.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Store className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No store connected</h3>
              <p className="mt-1 text-sm text-gray-500">Connect your Shopify store to start syncing data.</p>
              <div className="mt-6">
                <a
                  href="/setup"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Connect Store
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Key className="h-5 w-5 text-gray-400 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">API Keys</h3>
            </div>
            <button
              onClick={() => setShowGenerateForm(!showGenerateForm)}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Generate New Key
            </button>
          </div>
        </div>
        
        {showGenerateForm && (
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="space-y-4">
              <div>
                <label htmlFor="key-name" className="block text-sm font-medium text-gray-700">
                  Key Name
                </label>
                <input
                  type="text"
                  id="key-name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="e.g., Production API Key"
                />
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={generateApiKey}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Generate
                </button>
                <button
                  onClick={() => setShowGenerateForm(false)}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-4">
          {loading ? (
            <div className="animate-pulse h-32 bg-gray-200 rounded"></div>
          ) : apiKeys.length > 0 ? (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div key={key.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{key.name}</p>
                    <p className="text-xs text-gray-500">
                      Created {new Date(key.created_at).toLocaleDateString()}
                      {key.last_used && ` • Last used ${new Date(key.last_used).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => copyToClipboard(atob(key.key_hash))}
                      className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      {copiedKey === key.key_hash ? (
                        <Check className="h-3 w-3 mr-1" />
                      ) : (
                        <Copy className="h-3 w-3 mr-1" />
                      )}
                      Copy
                    </button>
                    <button
                      onClick={() => deleteApiKey(key.id)}
                      className="inline-flex items-center px-2 py-1 border border-red-300 text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Key className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No API keys</h3>
              <p className="mt-1 text-sm text-gray-500">Generate an API key to access your data programmatically.</p>
            </div>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white shadow rounded-lg border-red-200 border">
        <div className="px-6 py-4 bg-red-50 border-b border-red-200">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
            <h3 className="text-lg font-medium text-red-900">Danger Zone</h3>
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Delete Account</p>
              <p className="text-sm text-gray-500">Once you delete your account, there is no going back. Please be certain.</p>
            </div>
            <button
              onClick={() => alert('Account deletion is not implemented in this demo.')}
              className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}