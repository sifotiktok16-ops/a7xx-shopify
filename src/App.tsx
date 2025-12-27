import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import DashboardLayout from '@/components/DashboardLayout'
import Dashboard from '@/pages/Dashboard'
import Setup from '@/pages/Setup'
import Delivery from '@/pages/Delivery'
import Settings from '@/pages/Settings'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'

// ProtectedRoute component - ensures user is logged in
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

// AuthRoute component - redirects logged-in users away from auth pages
function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function AppContent() {
  const { restoreSession, setupAuthListener } = useAuthStore()

  useEffect(() => {
    // Setup auth listener once for automatic state updates
    const cleanup = setupAuthListener()
    
    // Restore session on app load
    restoreSession()
    
    return cleanup
  }, [restoreSession])

  return (
    <Routes>
      {/* Auth Routes */}
      <Route
        path="/login"
        element={
          <AuthRoute>
            <Login />
          </AuthRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <AuthRoute>
            <Signup />
          </AuthRoute>
        }
      />

      {/* Default redirect to login */}
      <Route
        path="/"
        element={<Navigate to="/login" replace />}
      />

      {/* Protected Routes - require authentication */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Dashboard />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/setup"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Setup />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/delivery"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Delivery />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Settings />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Catch all route */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
