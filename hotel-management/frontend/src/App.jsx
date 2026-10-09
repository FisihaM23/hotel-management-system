import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
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
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to="/" replace />} />
      <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to="/" replace />} />
      <Route path="/reset-password" element={!user ? <ResetPassword /> : <Navigate to="/" replace />} />

      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="rooms" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist']}><Rooms /></ProtectedRoute>} />
        <Route path="guests" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist']}><Guests /></ProtectedRoute>} />
        <Route path="bookings" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist']}><Bookings /></ProtectedRoute>} />
        <Route path="payments" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist']}><Payments /></ProtectedRoute>} />
        <Route path="housekeeping" element={<ProtectedRoute roles={['admin', 'manager', 'housekeeping']}><Housekeeping /></ProtectedRoute>} />
        <Route path="maintenance" element={<ProtectedRoute roles={['admin', 'manager', 'maintenance']}><Maintenance /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute roles={['admin']}><Users /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute roles={['admin', 'manager']}><Reports /></ProtectedRoute>} />
        <Route path="invoices" element={<ProtectedRoute roles={['admin', 'manager', 'receptionist']}><Invoices /></ProtectedRoute>} />
        <Route path="my-bookings" element={<ProtectedRoute roles={['customer']}><CustomerPortal /></ProtectedRoute>} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      </BrowserRouter>
    </AuthProvider>
  )
}
