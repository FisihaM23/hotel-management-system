import { Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import safeStorage from './utils/storage'
import Layout from './components/Layout'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#0a1628',
          color: '#e2e8f0',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: 480,
            width: '100%',
            background: 'rgba(13, 35, 71, 0.95)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 16,
            padding: 32,
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🏨</div>
            <h2 style={{ fontSize: 20, marginBottom: 10, color: '#f87171' }}>Something went wrong</h2>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.reload()
                }}
                style={{
                  background: '#38bdf8',
                  color: '#0f172a',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => {
                  safeStorage.removeItem('hms_token')
                  safeStorage.removeItem('hms_user')
                  window.location.href = '/login'
                }}
                style={{
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  padding: '10px 18px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Rooms from './pages/Rooms'
import Guests from './pages/Guests'
import Bookings from './pages/Bookings'
import Payments from './pages/Payments'
import Housekeeping from './pages/Housekeeping'
import Maintenance from './pages/Maintenance'
import Users from './pages/Users'
import Reports from './pages/Reports'
import Profile from './pages/Profile'
import CustomerPortal from './pages/CustomerPortal'
import Invoices from './pages/Invoices'
import Dining from './pages/Dining'
import PaymentSuccess from './pages/PaymentSuccess'
import Landing from './pages/Landing'
import { ThemeProvider } from './context/ThemeContext'

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      {/* ── 1. PUBLIC HOTEL & PARK DASHBOARD (DEFAULT FOR ALL NEWCOMERS) ──────── */}
      {/* Newcomer customer clicking the link automatically sees the hotel & park dashboard pages without sign-in */}
      <Route path="/" element={<Landing />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/hotel-park" element={<Landing />} />

      {/* ── 2. AUTHENTICATION (When visitor is comfortable and decides to register/sign-in) ── */}
      <Route path="/login" element={!user ? <Login /> : <Navigate to={user.role === 'customer' ? '/' : '/dashboard'} replace />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to={user.role === 'customer' ? '/' : '/dashboard'} replace />} />
      <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to="/" replace />} />
      <Route path="/reset-password" element={!user ? <ResetPassword /> : <Navigate to="/" replace />} />

      {/* ── 3. PROTECTED OPERATIONS LAYOUT (Staff Operations & Customer Portal) ── */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist', 'housekeeping', 'maintenance']}><Dashboard /></ProtectedRoute>} />
        <Route path="/rooms" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist']}><Rooms /></ProtectedRoute>} />
        <Route path="/guests" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist']}><Guests /></ProtectedRoute>} />
        <Route path="/bookings" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist']}><Bookings /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist']}><Payments /></ProtectedRoute>} />
        <Route path="/housekeeping" element={<ProtectedRoute roles={['admin', 'manager', 'housekeeping']}><Housekeeping /></ProtectedRoute>} />
        <Route path="/maintenance" element={<ProtectedRoute roles={['admin', 'manager', 'maintenance']}><Maintenance /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute roles={['admin']}><Users /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute roles={['admin', 'manager']}><Reports /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist']}><Invoices /></ProtectedRoute>} />
        <Route path="/dining" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist', 'customer']}><Dining /></ProtectedRoute>} />
        <Route path="/my-bookings" element={<ProtectedRoute roles={['customer']}><CustomerPortal /></ProtectedRoute>} />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* ── 4. FALLBACK ── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

