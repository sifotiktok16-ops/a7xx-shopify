import { create } from 'zustand'
import { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthUser {
  id: string
  email: string
}

interface AuthState {
  user: AuthUser | null
  session: Session | null
  loading: boolean
  error: string | null
  
  // Functions
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  resendConfirmation: (email: string) => Promise<void>
  signOut: () => Promise<void>
  restoreSession: () => Promise<void>
  setupAuthListener: () => () => void
  getUserId: () => string | null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  error: null,

  signUp: async (email: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password
      })
      
      if (error) throw error
      
      if (data?.session) {
        await supabase.auth.signOut()
      }
      
      set({ loading: false })
      console.log('✅ User created successfully in Supabase Auth')
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred during sign up',
        loading: false 
      })
      throw error
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      
      if (error) throw error
      
      const authUser: AuthUser | null = data.user ? {
        id: data.user.id,
        email: data.user.email || ''
      } : null
      
      set({ 
        user: authUser,
        session: data.session,
        loading: false,
        error: null
      })
      
      console.log('✅ User signed in successfully:', authUser?.id)
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred during sign in',
        loading: false 
      })
      throw error
    }
  },

  signInWithGoogle: async () => {
    set({ loading: true, error: null })
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      })
      
      if (error) throw error
      
      set({ loading: false })
      console.log('✅ Google OAuth initiated')
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred during Google sign in',
        loading: false 
      })
      throw error
    }
  },

  resendConfirmation: async (email: string) => {
    set({ loading: true, error: null })
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      })
      if (error) throw error
      set({ loading: false })
      console.log('✉️ Confirmation email resent if account exists')
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to resend confirmation email',
        loading: false,
      })
      throw error
    }
  },

  signOut: async () => {
    set({ loading: true, error: null })
    try {
      const { error } = await supabase.auth.signOut()
      
      if (error) throw error
      
      set({ 
        user: null,
        session: null,
        loading: false,
        error: null
      })
      
      console.log('✅ User signed out successfully')
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'An error occurred during sign out',
        loading: false 
      })
      throw error
    }
  },

  restoreSession: async () => {
    set({ loading: true, error: null })
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) throw error
      
      const authUser: AuthUser | null = session?.user ? {
        id: session.user.id,
        email: session.user.email || ''
      } : null
      
      set({ 
        user: authUser,
        session: session,
        loading: false,
        error: null
      })
      
      console.log('✅ Session restored:', authUser?.id ? 'User found' : 'No user')
    } catch (error) {
      console.error('❌ Session restore error:', error)
      set({ 
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to restore session'
      })
    }
  },

  setupAuthListener: () => {
    // Ensure we only set up the listener once
    if (authListenerSetup) {
      return () => {}
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('🔄 Auth state changed:', event, session?.user?.id)
        const authUser: AuthUser | null = session?.user ? {
          id: session.user.id,
          email: session.user.email || ''
        } : null
        set({
          user: authUser,
          session: session,
          loading: false,
          error: event === 'SIGNED_IN' ? null : get().error
        })
      }
    )
    authListenerSetup = true
    return () => {
      subscription.unsubscribe()
      authListenerSetup = false
    }
  },

  getUserId: () => {
    const { user } = get()
    return user?.id || null
  }
}))

// Auth state listener - setup once to update user + session automatically
let authListenerSetup = false
