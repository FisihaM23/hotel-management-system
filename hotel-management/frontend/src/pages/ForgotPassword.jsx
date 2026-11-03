import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Hotel, Mail, ArrowRight, ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { requestPasswordOtp } from '../services/api'
import { isValidEmail, EMAIL_POLICY_MESSAGE } from '../utils/validation'
import ThemeSelector from '../components/ThemeSelector'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) {
      return toast.error('Please enter your email address')
    }
    if (!isValidEmail(cleanEmail)) {
      return toast.error(EMAIL_POLICY_MESSAGE)
    }

    setLoading(true)
    try {
      const res = await requestPasswordOtp({ email: cleanEmail })
      sessionStorage.setItem('hms_reset_email', cleanEmail)
      toast.success(res.data?.message || 'Verification code sent to your email!')
      navigate(`/verify-otp?email=${encodeURIComponent(cleanEmail)}`, {
        state: { email: cleanEmail }
      })
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to dispatch verification code'
      toast.error(errorMsg)
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

      <div className="login-card" style={{ maxWidth: 460, boxShadow: 'none' }}>
        <div className="login-logo">
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', boxShadow: '0 8px 24px rgba(37,99,235,0.3)' }}>
            <Hotel size={34} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tp-ink)' }}>Forgot Password</h1>
          <p style={{ color: 'var(--tp-mute)', fontSize: 13.5 }}>
            Enter your account email to receive a secure 6-digit verification code
          </p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mail size={14} className="text-muted" />
              <span>Registered Email Address</span>
            </label>
            <input
              className="form-control"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. yourname@gmail.com"
              required
              autoFocus
              style={{ padding: '12px 14px', fontSize: 14 }}
            />
          </div>

          <div style={{
            background: 'var(--tp-surf-2, #142014)',
            border: '1px solid var(--tp-line, rgba(255,255,255,0.1))',
            borderRadius: 10,
            padding: '12px 14px',
            fontSize: 12.5,
            color: 'var(--tp-mute, #94a3b8)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 20,
            lineHeight: 1.5
          }}>
            <ShieldCheck size={18} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              For your security, a one-time 6-digit OTP will be dispatched to your inbox. The code will expire in <strong>5 minutes</strong>.
            </span>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '12px 16px',
              fontSize: 14.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(34,197,94,0.3)'
            }}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                <span>Sending Verification Code...</span>
              </>
            ) : (
              <>
                <span>Send 6-Digit Code</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <div style={{ textAlign: 'center', marginTop: 22 }}>
            <Link
              to="/login"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--tp-acc, #3b82f6)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <span>← Remember your password? Sign In</span>
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
