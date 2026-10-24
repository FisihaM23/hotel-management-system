import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Hotel, LogIn, UserPlus, Eye, EyeOff, Shield, Send, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { login, requestAccount, register } from '../services/api'
import { isValidEmail, EMAIL_POLICY_MESSAGE } from '../utils/validation'

const demoAccounts = [
  { label: 'Admin', email: 'befather7@gmail.com', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '👑' },
  { label: 'Manager', email: 'manager@hotel.com', color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', icon: '🏨' },
  { label: 'Receptionist', email: 'receptionist@hotel.com', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: '🛎️' },
  { label: 'Customer', email: 'customer@hotel.com', color: '#10b981', bg: '#f0fdf4', border: '#a7f3d0', icon: '🧳' },
  { label: 'Housekeeping', email: 'housekeeping@hotel.com', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: '🧹' },
  { label: 'Maintenance', email: 'maintenance@hotel.com', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', icon: '🔧' },
]

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
  const [regMode, setRegMode] = useState('request') // 'request' | 'register'

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
      setTimeout(() => { window.location.href = '/' }, 600)
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
      await register({ name: regName, email: regEmail, phone: regPhone, password: regPass })
      toast.success('Account created! Sign in now.')
      setEmail(regEmail)
      setPassword('')
      setTab('login')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed')
    } finally { setLoading(false) }
  }

  const fillDemo = (demoEmail) => {
    setEmail(demoEmail)
    setPassword('password123')
  }

  const tabBtn = (active) => ({
    flex: 1, padding: '9px 0', border: 'none', borderRadius: 8,
    cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    background: active ? '#fff' : 'transparent',
    color: active ? '#1d4ed8' : '#6b7280',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
  })

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 460 }}>

        <div className="login-logo">
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Hotel size={34} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Hotel Management</h1>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Secure Enterprise Hotel Administration</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: 20 }}>
          <button type="button" onClick={() => setTab('login')} style={tabBtn(tab === 'login')}>
            <LogIn size={15} /> Sign In
          </button>
          <button type="button" onClick={() => setTab('signup')} style={tabBtn(tab === 'signup')}>
            <Shield size={15} /> Account Provisioning
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
              style={{ width: '100%', justifyContent: 'center', padding: 11, fontSize: 15, marginTop: 4 }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: '#6b7280' }}>
              Need an account?{' '}
              <button
                type="button"
                onClick={() => setTab('signup')}
                style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Admin Provisioning Notice
              </button>
            </p>

            <div style={{ marginTop: 20, borderTop: '1px solid #f3f4f6', paddingTop: 16 }}>
              <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quick demo login
              </p>
              <style>{`
                .demo-btn {
                  flex: 1 1 0;
                  min-width: 0;
                  padding: 10px 4px 8px;
                  border-radius: 12px;
                  cursor: pointer;
                  font-size: 11px;
                  text-align: center;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  gap: 4px;
                  transition: transform 0.18s cubic-bezier(.4,0,.2,1),
                              box-shadow 0.18s cubic-bezier(.4,0,.2,1),
                              background 0.18s,
                              border-color 0.18s,
                              color 0.18s;
                  outline: none;
                }
                .demo-btn:hover {
                  transform: translateY(-4px) scale(1.08) !important;
                  box-shadow: 0 8px 20px var(--demo-color, #3b82f6)44 !important;
                }
                .demo-btn:active {
                  transform: translateY(-1px) scale(1.03) !important;
                }
                .demo-btn .demo-icon {
                  font-size: 18px;
                  line-height: 1;
                  transition: transform 0.18s;
                }
                .demo-btn:hover .demo-icon {
                  transform: scale(1.2) rotate(-5deg);
                }
                @media (max-width: 540px) {
                  .demo-accounts-bar {
                    grid-template-columns: repeat(3, 1fr) !important;
                    gap: 8px !important;
                  }
                }
                @media (max-width: 360px) {
                  .demo-accounts-bar {
                    grid-template-columns: repeat(2, 1fr) !important;
                  }
                }
              `}</style>
              <div className="demo-accounts-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                {demoAccounts.map(a => {
                  const isActive = email === a.email
                  return (
                    <button
                      key={a.email}
                      type="button"
                      className="demo-btn"
                      onClick={() => fillDemo(a.email)}
                      style={{
                        '--demo-color': a.color,
                        border: `2px solid ${isActive ? a.color : a.border}`,
                        background: isActive ? a.bg : '#fff',
                        color: isActive ? a.color : '#6b7280',
                        fontWeight: isActive ? 700 : 500,
                        transform: isActive ? 'translateY(-3px) scale(1.06)' : 'translateY(0) scale(1)',
                        boxShadow: isActive ? `0 6px 16px ${a.color}33` : '0 1px 3px rgba(0,0,0,0.06)',
                      }}
                    >
                      <span className="demo-icon">{a.icon}</span>
                      <span>{a.label}</span>
                    </button>
                  )
                })}
              </div>
              <p style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', marginTop: 10 }}>
                Demo passwords: <strong>password123</strong> (or <strong>Password123!</strong>)
              </p>
            </div>
          </form>
        )}

        {/* ── ACCOUNT PROVISIONING / SIGN UP ── */}
        {tab === 'signup' && (
          <div>
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 16,
              fontSize: 12.5,
              color: '#1e40af',
              lineHeight: 1.5
            }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
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
                style={{ flex: 1, fontSize: 12 }}
              >
                Request Account from Admin
              </button>
              <button
                type="button"
                onClick={() => setRegMode('register')}
                className={`btn btn-sm ${regMode === 'register' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, fontSize: 12 }}
              >
                Guest Self-Register
              </button>
            </div>

            {regMode === 'request' ? (
              requestSent ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <CheckCircle2 size={44} color="#16a34a" style={{ margin: '0 auto 10px' }} />
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Request Submitted</h3>
                  <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
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
                  <label className="form-label">Email Address * <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 500 }}>(Must be @gmail.com or @icloud.com)</span></label>
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
                  className="btn btn-success"
                  style={{ width: '100%', justifyContent: 'center', padding: 11, fontSize: 14 }}
                  disabled={loading}
                >
                  {loading ? 'Creating Account...' : 'Register Customer Account'}
                </button>
              </form>
            )}

            {/* Administrator Direct Information */}
            <div style={{ marginTop: 18, borderTop: '1px solid #f3f4f6', paddingTop: 14, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
              <div>System Administrator: <strong>Mulugeta Fisiha</strong></div>
              <div>Direct Email: <code>befather7@gmail.com</code> | Phone: <code>555-0001</code></div>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setTab('login')}
                  style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
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
