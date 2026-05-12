import React, { createContext, useContext, useEffect, useState } from 'react'

interface User {
  login: string
  avatar_url: string
}

interface AuthContextType {
  authenticated: boolean
  user: User | null
  sessionId: string | null
  installations: number[]
  login: () => void
  logout: () => void
  setSession: (sessionId: string) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [installations, setInstallations] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  // Check for session in URL params (OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const session = params.get('session')
    
    if (session) {
      localStorage.setItem('gh-session', session)
      setSessionId(session)
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    } else {
      // Check for existing session
      const storedSession = localStorage.getItem('gh-session')
      if (storedSession) {
        setSessionId(storedSession)
      }
    }
  }, [])

  // Verify session
  useEffect(() => {
    if (!sessionId) {
      setLoading(false)
      return
    }

    fetch('/api/auth/status', {
      headers: {
        'x-session-id': sessionId,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setAuthenticated(true)
          setUser(data.user)
          setInstallations(data.installations || [])
        } else {
          localStorage.removeItem('gh-session')
          setSessionId(null)
        }
      })
      .catch(() => {
        localStorage.removeItem('gh-session')
        setSessionId(null)
      })
      .finally(() => setLoading(false))
  }, [sessionId])

  const login = () => {
    window.location.href = '/api/auth/login'
  }

  const logout = async () => {
    if (sessionId) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'x-session-id': sessionId,
        },
      })
    }
    localStorage.removeItem('gh-session')
    setSessionId(null)
    setAuthenticated(false)
    setUser(null)
    setInstallations([])
  }

  const setSession = (newSessionId: string) => {
    localStorage.setItem('gh-session', newSessionId)
    setSessionId(newSessionId)
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  return (
    <AuthContext.Provider value={{ authenticated, user, sessionId, installations, login, logout, setSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Helper to add auth headers to fetch requests
export function getAuthHeaders(sessionId: string | null, installationId?: number) {
  const headers: HeadersInit = {}
  if (sessionId) {
    headers['x-session-id'] = sessionId
  }
  if (installationId) {
    headers['x-installation-id'] = installationId.toString()
  }
  return headers
}