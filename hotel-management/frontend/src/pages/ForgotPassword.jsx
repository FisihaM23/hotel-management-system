import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Hotel, Mail, CheckCircle2, KeyRound, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { forgotPassword } from '../services/api'
import { isValidEmail, EMAIL_POLICY_MESSAGE } from '../utils/validation'

export default function ForgotPassword() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const [token, setToken] = useState('')
    const [resetLink, setResetLink] = useState('')
    const [emailSent, setEmailSent] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!isValidEmail(email)) {
            return toast.error(EMAIL_POLICY_MESSAGE)
        }
        setLoading(true)
        try {
            const res = await forgotPassword({ email: email.trim() })
            setToken(res.data?.token || '')
            setResetLink(res.data?.reset_link || '')
            setEmailSent(Boolean(res.data?.email_sent))
            setSent(true)
        } catch (err) {
            toast.error(err.response?.data?.error || 'Something went wrong')
        } finally { setLoading(false) }
    }

    return (
        <div className="login-page">
            <div className="login-card" style={{ maxWidth: 460, boxShadow: 'none' }}>
                <div className="login-logo">
                    <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <Hotel size={34} color="#fff" />
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tp-ink)' }}>Forgot Password</h1>
                    <p style={{ color: 'var(--tp-mute)', fontSize: 13 }}>Enter your account email to generate a reset link</p>
                </div>

                {sent ? (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                            <CheckCircle2 size={32} color="#16a34a" />
                        </div>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tp-ink)', marginBottom: 6 }}>
                            Password Reset Link Ready
                        </h3>
                        <p style={{ fontSize: 13, color: 'var(--tp-mute)', marginBottom: 18 }}>
                            {emailSent
                                ? <>A reset link was emailed to <strong>{email}</strong>. You can also use the direct link below.</>
                                : <>Reset link generated for <strong>{email}</strong>.</>}
                        </p>

                        {resetLink && (
                            <div style={{ marginBottom: 16 }}>
                                <Link
                                    to={`/reset-password?token=${token}`}
                                    className="btn btn-primary"
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        gap: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600,
                                        width: '100%', textDecoration: 'none', marginBottom: 10,
                                        boxShadow: '0 4px 12px rgba(37,99,235,0.25)'
                                    }}
                                >
                                    <KeyRound size={16} /> Reset Password Now
                                </Link>

                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => {
                                        navigator.clipboard.writeText(resetLink)
                                        toast.success('Reset link copied to clipboard!')
                                    }}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', fontSize: 13, padding: '9px 16px' }}
                                >
                                    <Copy size={14} /> Copy Reset Link
                                </button>
                            </div>
                        )}

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#64748b', textAlign: 'left', marginBottom: 18, wordBreak: 'break-all' }}>
                            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 4 }}>Direct URL:</div>
                            <code>{resetLink || 'Generating link...'}</code>
                        </div>

                        {!emailSent && (
                            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#1e40af', textAlign: 'left', marginBottom: 18 }}>
                                💡 <strong>Local environment note:</strong> Live SMTP/email sending requires live Gmail credentials. Click <strong>Reset Password Now</strong> above to reset your password immediately.
                            </div>
                        )}

                        <Link to="/login" style={{ color: '#3b82f6', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Back to Sign In</Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">Email Address <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 500 }}>(Must be @gmail.com or @icloud.com)</span></label>
                            <input
                                className="form-control"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="befather7@gmail.com or user@icloud.com"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', justifyContent: 'center', padding: 11 }}
                            disabled={loading}
                        >
                            {loading ? 'Generating Link...' : 'Generate Reset Link'}
                        </button>
                        <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: '#6b7280' }}>
                            <Link to="/login" style={{ color: '#3b82f6' }}>Back to Sign In</Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    )
}

