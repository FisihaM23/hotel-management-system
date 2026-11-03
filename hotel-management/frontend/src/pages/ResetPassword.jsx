import { useState, useEffect } from 'react'
import { useSearchParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { ShieldCheck, Eye, EyeOff, KeyRound, CheckCircle2, ArrowLeft, Lock, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import ThemeSelector from '../components/ThemeSelector'
import { verifyResetToken, resetPasswordWithToken } from '../services/api'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Extract token & email from router state, query params, or sessionStorage
  const tokenFromState = location.state?.reset_token || ''
  const tokenFromQuery = params.get('token') || params.get('reset_token') || ''
  const tokenFromStorage = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('hms_reset_token') : null) || ''
  const activeToken = tokenFromState || tokenFromStorage || tokenFromQuery

  const emailFromState = location.state?.email || ''
  const emailFromQuery = params.get('email') || ''
  const emailFromStorage = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('hms_reset_email') : null) || ''
  const [email, setEmail] = useState(emailFromState || emailFromStorage || emailFromQuery)

  const [status, setStatus] = useState('verifying') // verifying | valid | invalid | done
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Password Policy Rules Checker
  const checkRules = (pw) => ({
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    num: /[0-9]/.test(pw),
    sym: /[\W_]/.test(pw)
  })

  const getStrength = (pw) => {
    const r = checkRules(pw)
    return Object.values(r).filter(Boolean).length
  }

  const strengthLabel = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
  const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a']
  const strength = getStrength(password)
  const rules = checkRules(password)

  useEffect(() => {
    if (!activeToken) {
      setStatus('invalid')
      setErrorMessage('No valid password reset authorization token provided. Please initiate verification again.')
      return
    }

    // If token comes directly from OTP verification, it was just verified and authorized
    if (tokenFromState || (tokenFromStorage && !tokenFromQuery)) {
      setStatus('valid')
      return
    }

    // If token is from URL query param (legacy or direct link), verify with backend
    verifyResetToken(activeToken)
      .then(res => {
        setStatus('valid')
        if (res.data?.email) setEmail(res.data.email)
      })
      .catch(err => {
        setStatus('invalid')
        setErrorMessage(err.response?.data?.error || 'Password reset token has expired or is invalid.')
      })
  }, [activeToken, tokenFromState, tokenFromStorage, tokenFromQuery])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')

    if (password !== confirm) {
      return toast.error('Passwords do not match')
    }

    if (strength < 5) {
      return toast.error('Please fulfill all 5 security requirements')
    }

    setLoading(true)
    try {
      await resetPasswordWithToken({
        email: email || undefined,
        reset_token: activeToken,
        password,
        confirm_password: confirm
      })

      // Clean up local session storage
      try {
        sessionStorage.removeItem('hms_reset_token')
        sessionStorage.removeItem('hms_reset_email')
      } catch (_) {}

      setStatus('done')
      toast.success('Password updated successfully!')
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to reset password. Please try again.'
      setErrorMessage(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Top Utility Bar */}
      <div style={{ position: 'absolute', top: 16, left: 20, right: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 20 }}>
        <Link
          to="/login"
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
            backdropFilter: 'blur(8px)',
            textDecoration: 'none'
          }}
        >
          <ArrowLeft size={15} />
          <span>Back to Sign In</span>
        </Link>
        <ThemeSelector variant="dropdown" align="right" />
      </div>

      <div className="login-card" style={{ maxWidth: 480, boxShadow: 'none' }}>
        {/* Header Branding */}
        <div className="login-logo">
          <div style={{
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg,#d4af37,#b8860b)',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            boxShadow: '0 8px 24px rgba(212,175,55,0.3)'
          }}>
            <Lock size={32} color="#050805" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tp-ink)' }}>Create New Password</h1>
          <p style={{ color: 'var(--tp-mute)', fontSize: 13.5, marginTop: 4 }}>
            Secure Single-Use Authentication Gateway
          </p>
        </div>

        {/* Verifying Token State */}
        {status === 'verifying' && (
          <div className="loading" style={{ padding: '36px 0', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--tp-mute)', fontSize: 13.5 }}>
              Verifying cryptographic authorization...
            </p>
          </div>
        )}

        {/* Invalid or Expired Token State */}
        {status === 'invalid' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#ef4444'
            }}>
              <AlertCircle size={30} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tp-ink)', marginBottom: 8 }}>
              Authorization Expired or Invalid
            </h3>
            <p style={{ color: 'var(--tp-mute)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
              {errorMessage || 'This password reset session has expired (15-minute security limit) or has already been used. Please request a new verification code.'}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Link
                to="/forgot-password"
                className="btn btn-primary"
                style={{ textDecoration: 'none', fontSize: 13, padding: '10px 20px', fontWeight: 600 }}
              >
                Request New Code
              </Link>
              <Link
                to="/login"
                className="btn btn-outline"
                style={{ textDecoration: 'none', fontSize: 13, padding: '10px 18px', fontWeight: 600 }}
              >
                Back to Sign In
              </Link>
            </div>
          </div>
        )}

        {/* Successfully Changed Password State */}
        {status === 'done' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#22c55e'
            }}>
              <CheckCircle2 size={36} />
            </div>
            <h3 style={{ fontSize: 19, fontWeight: 700, color: 'var(--tp-ink)', marginBottom: 8 }}>
              Password Reset Complete!
            </h3>
            <p style={{ color: 'var(--tp-mute)', fontSize: 13, marginBottom: 22, lineHeight: 1.6 }}>
              Your account password has been securely updated. All previous reset tokens and unauthorized sessions have been invalidated.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px 20px', fontWeight: 700, fontSize: 14 }}
              onClick={() => navigate('/login')}
            >
              Sign In with New Password
            </button>
          </div>
        )}

        {/* Form to Input New Password */}
        {status === 'valid' && (
          <form onSubmit={handleSubmit}>
            {email && (
              <div style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 18,
                fontSize: 12.5,
                color: 'var(--tp-ink)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <ShieldCheck size={16} color="#22c55e" />
                <span>Verified reset for <strong style={{ color: 'var(--tp-acc, #22c55e)' }}>{email}</strong></span>
              </div>
            )}

            {errorMessage && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 12.5,
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* New Password */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-control"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter a strong new password"
                  required
                  autoFocus
                  style={{
                    paddingRight: 40,
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--tp-mute, #9ca3af)',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password strength & policy checklist */}
              {password && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          background: i <= strength ? strengthColor[strength] : 'var(--tp-line, #334155)',
                          transition: 'all 0.25s ease'
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: strengthColor[strength] }}>
                      {strengthLabel[strength]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--tp-mute)' }}>{strength}/5 criteria met</span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '4px 8px',
                    fontSize: 11,
                    background: 'var(--tp-surf, rgba(255,255,255,0.03))',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--tp-line, rgba(255,255,255,0.08))'
                  }}>
                    <span style={{ color: rules.length ? '#22c55e' : 'var(--tp-mute)' }}>
                      {rules.length ? '✓' : '○'} At least 8 characters
                    </span>
                    <span style={{ color: rules.upper ? '#22c55e' : 'var(--tp-mute)' }}>
                      {rules.upper ? '✓' : '○'} Uppercase (A-Z)
                    </span>
                    <span style={{ color: rules.lower ? '#22c55e' : 'var(--tp-mute)' }}>
                      {rules.lower ? '✓' : '○'} Lowercase (a-z)
                    </span>
                    <span style={{ color: rules.num ? '#22c55e' : 'var(--tp-mute)' }}>
                      {rules.num ? '✓' : '○'} Number (0-9)
                    </span>
                    <span style={{ color: rules.sym ? '#22c55e' : 'var(--tp-mute)', gridColumn: 'span 2' }}>
                      {rules.sym ? '✓' : '○'} Special character (!@#$%&*?)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Confirm New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-control"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Re-enter your new password"
                  required
                  style={{
                    paddingRight: 40,
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(p => !p)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--tp-mute, #9ca3af)',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {confirm && password !== confirm && (
                <span style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'block' }}>
                  Passwords do not match
                </span>
              )}
              {confirm && password === confirm && (
                <span style={{ fontSize: 11.5, color: '#22c55e', marginTop: 4, display: 'block' }}>
                  ✓ Passwords match
                </span>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: loading || strength < 5 || password !== confirm ? 'not-allowed' : 'pointer',
                opacity: loading || strength < 5 || password !== confirm ? 0.65 : 1
              }}
              disabled={loading || strength < 5 || password !== confirm}
            >
              <KeyRound size={16} />
              <span>{loading ? 'Encrypting & Saving...' : 'Save New Password'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
