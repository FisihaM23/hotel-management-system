import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Hotel, KeyRound, Clock, RotateCcw, ArrowRight, ArrowLeft, ShieldAlert, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { verifyPasswordOtp, resendPasswordOtp } from '../services/api'
import ThemeSelector from '../components/ThemeSelector'

export default function VerifyOTP() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  // Get email from URL params, location state, or sessionStorage
  const email = (
    params.get('email') ||
    location.state?.email ||
    sessionStorage.getItem('hms_reset_email') ||
    ''
  ).trim().toLowerCase()

  // 6 digit array for individual input boxes
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const inputRefs = useRef([])

  // 5-minute OTP countdown timer (300 seconds)
  const [timeLeft, setTimeLeft] = useState(300)

  // 60-second Resend cooldown timer
  const [resendCooldown, setResendCooldown] = useState(60)

  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Redirect if no email provided
  useEffect(() => {
    if (!email) {
      toast.error('Please enter your email first')
      navigate('/forgot-password', { replace: true })
    }
  }, [email, navigate])

  // Focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [])

  // 5-minute OTP expiration timer
  useEffect(() => {
    if (timeLeft <= 0) return
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [timeLeft])

  // 60-second Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // Mask email for privacy display: e.g. befather7@gmail.com -> b***7@gmail.com
  const maskEmail = (str) => {
    if (!str || !str.includes('@')) return str
    const [name, domain] = str.split('@')
    if (name.length <= 2) return `${name[0]}*@${domain}`
    return `${name[0]}${'*'.repeat(Math.max(3, name.length - 2))}${name[name.length - 1]}@${domain}`
  }

  // Handle individual digit input change
  const handleDigitChange = (index, value) => {
    // Only accept numeric digits
    const cleaned = value.replace(/\D/g, '')
    if (!cleaned) {
      const newDigits = [...otpDigits]
      newDigits[index] = ''
      setOtpDigits(newDigits)
      setErrorMsg('')
      return
    }

    // If multiple characters pasted directly into a single box
    if (cleaned.length > 1) {
      handlePasteString(cleaned)
      return
    }

    const newDigits = [...otpDigits]
    newDigits[index] = cleaned[cleaned.length - 1]
    setOtpDigits(newDigits)
    setErrorMsg('')

    // Auto-advance to next input
    if (index < 5 && cleaned) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  // Handle keydown for backspace navigation
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  // Handle paste full 6-digit code
  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').trim()
    handlePasteString(pastedData)
  }

  const handlePasteString = (str) => {
    const numbers = str.replace(/\D/g, '').slice(0, 6)
    if (!numbers) return
    const newDigits = ['', '', '', '', '', '']
    for (let i = 0; i < numbers.length; i++) {
      newDigits[i] = numbers[i]
    }
    setOtpDigits(newDigits)
    setErrorMsg('')
    const nextIndex = Math.min(numbers.length, 5)
    inputRefs.current[nextIndex]?.focus()
  }

  // Format time mm:ss
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
  }

  const otpValue = otpDigits.join('')

  // Verify OTP submission
  const handleVerify = async (e) => {
    if (e) e.preventDefault()
    if (otpValue.length !== 6) {
      return toast.error('Please enter the complete 6-digit code')
    }
    if (timeLeft <= 0) {
      return toast.error('Verification code has expired. Please request a new code.')
    }

    setLoading(true)
    setErrorMsg('')
    try {
      const res = await verifyPasswordOtp({ email, otp: otpValue })
      const resetToken = res.data?.reset_token
      if (!resetToken) throw new Error('Did not receive reset authorization token')

      sessionStorage.setItem('hms_reset_token', resetToken)
      sessionStorage.setItem('hms_reset_email', email)
      toast.success('Code verified successfully!')

      // Navigate to reset password page with token
      navigate(`/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetToken)}`, {
        state: { email, resetToken }
      })
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid verification code'
      setErrorMsg(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Resend OTP
  const handleResend = async () => {
    if (resendCooldown > 0) return
    setResending(true)
    setErrorMsg('')
    try {
      const res = await resendPasswordOtp({ email })
      toast.success(res.data?.message || 'New verification code dispatched!')
      setOtpDigits(['', '', '', '', '', ''])
      setTimeLeft(300) // Reset 5-minute countdown
      setResendCooldown(60) // Reset 60-second cooldown
      inputRefs.current[0]?.focus()
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to resend code'
      toast.error(msg)
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="login-page">
      {/* Top Utility Bar */}
      <div style={{ position: 'absolute', top: 16, left: 20, right: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 20 }}>
        <Link
          to="/forgot-password"
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
          <span>Change Email</span>
        </Link>
        <ThemeSelector variant="dropdown" align="right" />
      </div>

      <div className="login-card" style={{ maxWidth: 480, boxShadow: 'none' }}>
        <div className="login-logo">
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#d4af37,#b8860b)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', boxShadow: '0 8px 24px rgba(212,175,55,0.3)' }}>
            <KeyRound size={32} color="#050805" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tp-ink)' }}>Enter Verification Code</h1>
          <p style={{ color: 'var(--tp-mute)', fontSize: 13.5, marginTop: 4 }}>
            We dispatched a 6-digit verification code to
          </p>
          <div style={{ display: 'inline-block', background: 'var(--tp-surf-2, #142014)', border: '1px solid var(--tp-line)', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 700, color: 'var(--tp-acc, #22c55e)', marginTop: 6 }}>
            {maskEmail(email)}
          </div>
        </div>

        <form onSubmit={handleVerify}>
          {/* 6-Digit Individual Input Grid */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 8,
              margin: '24px 0 16px'
            }}
            onPaste={handlePaste}
          >
            {otpDigits.map((digit, idx) => (
              <input
                key={idx}
                ref={el => inputRefs.current[idx] = el}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digit}
                onChange={e => handleDigitChange(idx, e.target.value)}
                onKeyDown={e => handleKeyDown(idx, e)}
                style={{
                  width: 52,
                  height: 60,
                  fontSize: 24,
                  fontWeight: 800,
                  textAlign: 'center',
                  borderRadius: 12,
                  background: 'var(--tp-surf-2, #142014)',
                  color: 'var(--tp-ink, #ffffff)',
                  border: digit ? '2px solid var(--tp-acc, #22c55e)' : '1.5px solid var(--tp-line, rgba(255,255,255,0.18))',
                  boxShadow: digit ? '0 0 12px rgba(34,197,94,0.25)' : 'none',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
              />
            ))}
          </div>

          {/* Error Message Alert */}
          {errorMsg && (
            <div style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12.5,
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16
            }}>
              <ShieldAlert size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Timers Row: 5-minute countdown & 60-second resend */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--tp-surf-2, #142014)',
            border: '1px solid var(--tp-line, rgba(255,255,255,0.08))',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 12.5,
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: timeLeft > 60 ? 'var(--tp-mute)' : '#ef4444' }}>
              <Clock size={15} />
              <span>Expires in: <strong>{formatTime(timeLeft)}</strong></span>
            </div>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending}
              style={{
                background: 'transparent',
                border: 'none',
                color: resendCooldown > 0 ? 'var(--tp-mute, #64748b)' : 'var(--tp-acc, #38bdf8)',
                cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: 12.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 8px'
              }}
            >
              <RotateCcw size={13} className={resending ? 'spin' : ''} />
              <span>{resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend Code'}</span>
            </button>
          </div>

          {/* Verify Button */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || otpValue.length !== 6 || timeLeft <= 0}
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '12px 16px',
              fontSize: 14.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
              opacity: (otpValue.length !== 6 || timeLeft <= 0) ? 0.6 : 1
            }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                <span>Verifying Cryptographic Code...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>Verify & Continue</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link
              to="/forgot-password"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--tp-mute, #94a3b8)',
                textDecoration: 'none'
              }}
            >
              Did not receive code? Check spam or request new email
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

