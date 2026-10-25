import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Hotel, CheckCircle, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { verifyResetToken, resetUserPassword } from '../services/api'

export default function ResetPassword() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const token = params.get('token') || ''

    const [status, setStatus] = useState('verifying') // verifying | valid | invalid | done
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [loading, setLoading] = useState(false)

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
        if (!token) { setStatus('invalid'); return }
        verifyResetToken(token)
            .then(res => {
                setStatus('valid')
                if (res.data?.email) setEmail(res.data.email)
            })
            .catch(() => setStatus('invalid'))
    }, [token])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (password !== confirm) return toast.error('Passwords do not match')
        if (strength < 5) return toast.error('Please fulfill all password security requirements')
        setLoading(true)
        try {
            await resetUserPassword({ token, password })
            setStatus('done')
            toast.success('Password updated successfully!')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Reset failed')
        } finally { setLoading(false) }
    }

    return (
        <div className="login-page">
            <div className="login-card" style={{ maxWidth: 460, boxShadow: 'none' }}>
                <div className="login-logo">
                    <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <Hotel size={34} color="#fff" />
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tp-ink)' }}>Reset Account Password</h1>
                    <p style={{ color: 'var(--tp-mute)', fontSize: 13.5 }}>Secure Single-Use Authentication Gateway</p>
                </div>

                {status === 'verifying' && (
                    <div className="loading" style={{ padding: '30px 0' }}>
                        <div className="spinner" />
                        Verifying cryptographic token security...
                    </div>
                )}

                {status === 'invalid' && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                            <span style={{ fontSize: 24 }}>⚠️</span>
                        </div>
                        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>
                            Invalid or Expired Token
                        </h3>
                        <p style={{ color: 'var(--tp-mute)', fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
                            This password reset token has expired (1 hour limit) or has already been used. Please request a new link or contact Administrator <strong>Mulugeta Fisiha</strong>.
                        </p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            <Link to="/forgot-password" className="btn btn-primary" style={{ textDecoration: 'none', fontSize: 13, padding: '9px 18px', fontWeight: 700 }}>
                                Request New Link
                            </Link>
                            <Link to="/login" className="btn btn-outline" style={{ textDecoration: 'none', fontSize: 13, padding: '9px 18px', fontWeight: 700 }}>
                                Back to Sign In
                            </Link>
                        </div>
                    </div>
                )}

                {status === 'done' && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <CheckCircle size={54} color="#22c55e" style={{ margin: '0 auto 14px', display: 'block' }} />
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tp-ink)', marginBottom: 6 }}>
                            Password Successfully Reset
                        </h3>
                        <p style={{ color: 'var(--tp-mute)', fontSize: 13, marginBottom: 20 }}>
                            Your credentials have been securely updated and old reset links invalidated. You can now sign in with your new password.
                        </p>
                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '12px 20px', fontWeight: 600, fontSize: 14 }}
                            onClick={() => navigate('/login')}
                        >
                            Sign In Now
                        </button>
                    </div>
                )}

                {status === 'valid' && (
                    <form onSubmit={handleSubmit}>
                        {email && (
                            <div style={{
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: 8,
                                padding: '10px 14px',
                                marginBottom: 16,
                                fontSize: 12.5,
                                color: '#166534',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8
                            }}>
                                <ShieldCheck size={16} /> Verified token for <strong>{email}</strong>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">New Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="form-control"
                                    type={showPass ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Enter your strong new password"
                                    required
                                    style={{ paddingRight: 40 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(p => !p)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
                                >
                                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            {/* Password strength & policy checklist */}
                            {password && (
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <div
                                                key={i}
                                                style={{
                                                    flex: 1,
                                                    height: 4,
                                                    borderRadius: 2,
                                                    background: i <= strength ? strengthColor[strength] : '#e5e7eb',
                                                    transition: 'all 0.2s'
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: strengthColor[strength] }}>
                                            {strengthLabel[strength]}
                                        </span>
                                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{strength}/5 criteria met</span>
                                    </div>

                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, 1fr)',
                                        gap: '4px 10px',
                                        fontSize: 11,
                                        background: '#f8fafc',
                                        padding: 8,
                                        borderRadius: 6,
                                        border: '1px solid #e2e8f0'
                                    }}>
                                        <span style={{ color: rules.length ? '#16a34a' : '#94a3b8' }}>
                                            {rules.length ? '✓' : '○'} At least 8 characters
                                        </span>
                                        <span style={{ color: rules.upper ? '#16a34a' : '#94a3b8' }}>
                                            {rules.upper ? '✓' : '○'} Uppercase letter (A-Z)
                                        </span>
                                        <span style={{ color: rules.lower ? '#16a34a' : '#94a3b8' }}>
                                            {rules.lower ? '✓' : '○'} Lowercase letter (a-z)
                                        </span>
                                        <span style={{ color: rules.num ? '#16a34a' : '#94a3b8' }}>
                                            {rules.num ? '✓' : '○'} Number (0-9)
                                        </span>
                                        <span style={{ color: rules.sym ? '#16a34a' : '#94a3b8', gridColumn: 'span 2' }}>
                                            {rules.sym ? '✓' : '○'} Special character (!@#$%&*?)
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirm New Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="form-control"
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    placeholder="Repeat new password"
                                    required
                                    style={{ paddingRight: 40 }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(p => !p)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
                                >
                                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            {confirm && password !== confirm && (
                                <span style={{ fontSize: 11, color: '#ef4444', marginTop: 3, display: 'block' }}>
                                    Passwords do not match
                                </span>
                            )}
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                            disabled={loading || strength < 5 || password !== confirm}
                        >
                            <KeyRound size={16} />
                            {loading ? 'Encrypting & Saving...' : 'Set Secure Password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
