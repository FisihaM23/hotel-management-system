import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Hotel, LogIn, UserPlus, Eye, EyeOff, Shield, Send, CheckCircle2, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { login, requestAccount, register } from '../services/api'
import { isValidEmail, EMAIL_POLICY_MESSAGE } from '../utils/validation'
import ThemeSelector from '../components/ThemeSelector'

export default function Login() {
  const [tab, setTab] = useState('login') // 'login' | 'signup'
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('befather7@gmail.com')
  const [password, setPassword] = useState('password123')

  // Account Request State
  const [reqName, setReqName] = useState('')
  const [reqEmail, setReqEmail] = useState('')
  const [reqPhone, setReqPhone] = useState('')
  const [reqRole, setReqRole] = useState('customer')
  const [reqNotes, setReqNotes] = useState('')
  const [requestSent, setRequestSent] = useState(false)

  // Direct Customer Registration State
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regConf, setRegConf] = useState('')
  const [regMode, setRegMode] = useState('register') // 'register' | 'request'

  const { loginUser } = useAuth()

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Enter email and password')
      return
    }
    setLoading(true)
    try {
      const res = await login({ email: email.trim(), password: password })
      const { token, user } = res.data
      if (!token || !user) throw new Error('Bad server response')
      loginUser(token, user)
      toast.success('Welcome, ' + user.name + '!')
      // When customer logs in, take them automatically to the hotel & park showcase
      if (user.role === 'customer') {
        setTimeout(() => { window.location.href = '/' }, 600)
      } else {
        setTimeout(() => { window.location.href = '/dashboard' }, 600)
      }
    } catch (err) {
      setLoading(false)
      const msg = err.response?.data?.error || 'Login failed — check email/password'
      toast.error(msg)
    }
  }

  const handleAccountRequest = async (e) => {
    e.preventDefault()
    if (!isValidEmail(reqEmail)) {
      return toast.error(EMAIL_POLICY_MESSAGE)
    }
    setLoading(true)
    try {
      await requestAccount({
        name: reqName,
        email: reqEmail,
        phone: reqPhone,
        role: reqRole,
        notes: reqNotes
      })
      setRequestSent(true)
      toast.success('Account request submitted to Admin Mulugeta Fisiha!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit request')
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    if (!isValidEmail(regEmail)) {
      return toast.error(EMAIL_POLICY_MESSAGE)
    }
    if (regPass.length < 8) return toast.error('Password must be at least 8 characters')
    if (!/[A-Z]/.test(regPass)) return toast.error('Password must contain an uppercase letter')
    if (!/[a-z]/.test(regPass)) return toast.error('Password must contain a lowercase letter')
    if (!/[0-9]/.test(regPass)) return toast.error('Password must contain a number')
    if (!/[\W_]/.test(regPass)) return toast.error('Password must contain a special character')
    if (regPass !== regConf) return toast.error('Passwords do not match')
    setLoading(true)
    try {
      const regRes = await register({ name: regName, email: regEmail, phone: regPhone, password: regPass })
      if (regRes?.data?.email_sent) {
        if (regRes.data.sandbox_mode) {
          toast.success('✉️ Welcome email dispatched & notification active!')
        } else {
          toast.success('✉️ Welcome email sent to your inbox!')
        }
      } else {
        toast.info('🎉 Welcome notification created in your guest portal!')
      }
      // Auto-login newcomer customer directly to the landing page
      try {
        const loginRes = await login({ email: regEmail.trim(), password: regPass })
        const { token, user } = loginRes.data
        if (token && user) {
          loginUser(token, user)
          toast.success(`🎉 Welcome to Grand Hotel, ${user.name}!`)
          setTimeout(() => { window.location.href = '/' }, 600)
          return
        }
      } catch (loginErr) {
        console.warn('Auto-login fallback:', loginErr)
      }
      toast.success('Account created! Sign in now.')
      setEmail(regEmail)
      setPassword('')
      setTab('login')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed')
    } finally { setLoading(false) }
  }

  const tabBtn = (active) => ({
    flex: 1, padding: '9px 0', border: 'none', borderRadius: 8,
    cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    background: active ? 'var(--tp-acc)' : 'transparent',
    color: active ? 'var(--tp-acc-ink, #ffffff)' : 'var(--tp-mute)',
    boxShadow: active ? '0 2px 8px color-mix(in oklab, var(--tp-acc) 30%, transparent)' : 'none',
    transition: 'all 0.2s ease'
  })

  return (
    <div className="login-page">
      {/* Top Utility Bar */}
      <div style={{ position: 'absolute', top: 16, left: 20, right: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 20 }}>
        <Link
          to="/landing"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--tp-mute, #94a3b8)',
            background: 'var(--tp-surf, rgba(0,0,0,0.4))',
            padding: '6px 14px',
            borderRadius: 20,
            border: '1px solid var(--tp-line, rgba(255,255,255,0.1))',
            backdropFilter: 'blur(8px)'
          }}
        >
          <ArrowLeft size={15} />
          <span>Explore Hotel & Resort Park</span>
        </Link>
        <ThemeSelector variant="dropdown" align="right" />
      </div>

      <div className="login-card" style={{ maxWidth: 460, boxShadow: 'none' }}>

        <div className="login-logo">
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Hotel size={34} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tp-ink)' }}>Hotel Management</h1>
          <p style={{ color: 'var(--tp-mute)', fontSize: 13 }}>Secure Enterprise Hotel Administration</p>
        </div>

        {/* Tabs: Only Login and Create Account */}
        <div style={{ display: 'flex', background: 'var(--tp-surf-2)', border: '1px solid var(--tp-line)', borderRadius: 10, padding: 4, marginBottom: 20 }}>
          <button type="button" onClick={() => setTab('login')} style={tabBtn(tab === 'login')}>
            <LogIn size={15} /> Sign In
          </button>
          <button type="button" onClick={() => { setTab('signup'); setRegMode('register') }} style={tabBtn(tab === 'signup')}>
            <UserPlus size={15} /> Create Account
          </button>
        </div>

        {/* ── LOGIN ── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} autoComplete="off">
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                className="form-control"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="befather7@gmail.com or admin@hotel.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Password
                <Link to="/forgot-password" style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500 }}>
                  Forgot password?
                </Link>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-control"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="password123"
                  style={{ paddingRight: 40 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 15, marginTop: 4, fontWeight: 700 }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13.5, color: 'var(--tp-mute)' }}>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => { setTab('signup'); setRegMode('register') }}
                style={{ background: 'none', border: 'none', color: 'var(--tp-acc)', cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}
              >
                Create Account
              </button>
            </p>
          </form>
        )}

        {/* ── ACCOUNT PROVISIONING / SIGN UP ── */}
        {tab === 'signup' && (
          <div>
            <div style={{
              background: 'var(--tp-surf-2)',
              border: '1px solid var(--tp-line)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 16,
              fontSize: 12.5,
              color: 'var(--tp-ink)',
              lineHeight: 1.5
            }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: 'var(--tp-acc)' }}>
                <Shield size={16} /> Admin Account Creation Policy
              </div>
              All user accounts and credentials are created and managed by System Administrator <strong>Mulugeta Fisiha</strong> (<code>befather7@gmail.com</code>).
            </div>

            {/* Sub-modes: Request from Admin vs Self-Register Customer */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setRegMode('request')}
                className={`btn btn-sm ${regMode === 'request' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, fontSize: 12, fontWeight: 700 }}
              >
                Request Account from Admin
              </button>
              <button
                type="button"
                onClick={() => setRegMode('register')}
                className={`btn btn-sm ${regMode === 'register' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, fontSize: 12, fontWeight: 700 }}
              >
                Guest Self-Register
              </button>
            </div>

            {regMode === 'request' ? (
              requestSent ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <CheckCircle2 size={44} color="#16a34a" style={{ margin: '0 auto 10px' }} />
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tp-ink)', marginBottom: 6 }}>Request Submitted</h3>
                  <p style={{ fontSize: 13, color: 'var(--tp-mute)', marginBottom: 14 }}>
                    Your request was sent to Administrator <strong>Mulugeta Fisiha</strong>. You will receive account access details upon verification.
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => { setRequestSent(false); setTab('login') }}
                    style={{ fontSize: 13 }}
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAccountRequest}>
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input
                      className="form-control"
                      value={reqName}
                      onChange={e => setReqName(e.target.value)}
                      placeholder="e.g. Abebe Bikila"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address * <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 500 }}>(Must be @gmail.com or @icloud.com)</span></label>
                    <input
                      className="form-control"
                      type="email"
                      value={reqEmail}
                      onChange={e => setReqEmail(e.target.value)}
                      placeholder="yourname@gmail.com or user@icloud.com"
                      required
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Phone</label>
                      <input
                        className="form-control"
                        value={reqPhone}
                        onChange={e => setReqPhone(e.target.value)}
                        placeholder="+251 932 338 138"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Requested Role</label>
                      <select
                        className="form-control"
                        value={reqRole}
                        onChange={e => setReqRole(e.target.value)}
                      >
                        <option value="customer">Guest / Customer</option>
                        <option value="receptionist">Receptionist</option>
                        <option value="housekeeping">Housekeeping</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Purpose / Notes</label>
                    <input
                      className="form-control"
                      value={reqNotes}
                      onChange={e => setReqNotes(e.target.value)}
                      placeholder="Booking ref, staff department, etc."
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: 11, fontSize: 14 }}
                    disabled={loading}
                  >
                    <Send size={14} style={{ marginRight: 6 }} />
                    {loading ? 'Submitting Request...' : 'Send Request to Administrator'}
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={handleSignup}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    className="form-control"
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address * <span style={{ fontSize: 11, color: 'var(--tp-acc)', fontWeight: 600 }}>(Must be @gmail.com or @icloud.com)</span></label>
                  <input
                    className="form-control"
                    type="email"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    placeholder="yourname@gmail.com or user@icloud.com"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    className="form-control"
                    value={regPhone}
                    onChange={e => setRegPhone(e.target.value)}
                    placeholder="+251 932 338 138"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Password *</label>
                    <input
                      className="form-control"
                      type="password"
                      value={regPass}
                      onChange={e => setRegPass(e.target.value)}
                      placeholder="Min 8 chars, mixed case, number & symbol"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirm *</label>
                    <input
                      className="form-control"
                      type="password"
                      value={regConf}
                      onChange={e => setRegConf(e.target.value)}
                      placeholder="Repeat"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: 11, fontSize: 14, fontWeight: 700 }}
                  disabled={loading}
                >
                  {loading ? 'Creating Account...' : 'Register Customer Account'}
                </button>
              </form>
            )}

            {/* Administrator Direct Information */}
            <div style={{ marginTop: 18, borderTop: '1px solid var(--tp-line)', paddingTop: 14, textAlign: 'center', fontSize: 12, color: 'var(--tp-mute)' }}>
              <div>System Administrator: <strong>Mulugeta Fisiha</strong></div>
              <div>Direct Email: <code>befather7@gmail.com</code> | Phone: <code>555-0001</code></div>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setTab('login')}
                  style={{ background: 'none', border: 'none', color: 'var(--tp-acc)', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                >
                  ← Back to Sign In
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
