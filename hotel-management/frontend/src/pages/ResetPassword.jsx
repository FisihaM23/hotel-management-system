import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Hotel, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

const API = 'http://localhost/hotel-management/api'

export default function ResetPassword() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const token = params.get('token') || ''

    const [status, setStatus] = useState('verifying') // verifying | valid | invalid | done
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [loading, setLoading] = useState(false)

    const getStrength = (pw) => {
        let s = 0
        if (pw.length >= 8) s++
        if (/[A-Z]/.test(pw)) s++
        if (/[a-z]/.test(pw)) s++
        if (/[0-9]/.test(pw)) s++
        if (/[\W_]/.test(pw)) s++
        return s
    }
    const strengthLabel = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
    const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a']
    const strength = getStrength(password)

    useEffect(() => {
        if (!token) { setStatus('invalid'); return }
        axios.get(`${API}/reset_passwords.php?action=verify&token=${token}`)
            .then(() => setStatus('valid'))
            .catch(() => setStatus('invalid'))
    }, [token])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (password !== confirm) return toast.error('Passwords do not match')
        if (strength < 4) return toast.error('Password is too weak')
        setLoading(true)
        try {
            await axios.post(`${API}/reset_passwords.php?action=reset`, { token, password })
            setStatus('done')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Reset failed')
        } finally { setLoading(false) }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <Hotel size={34} color="#fff" />
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Reset Password</h1>
                </div>

                {status === 'verifying' && (
                    <div className="loading"><div className="spinner" />Verifying link...</div>
                )}

                {status === 'invalid' && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <p style={{ color: '#ef4444', fontWeight: 600, marginBottom: 12 }}>This reset link is invalid or has expired.</p>
                        <Link to="/forgot-password" style={{ color: '#3b82f6', fontSize: 13 }}>Request a new link</Link>
                    </div>
                )}

                {status === 'done' && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <CheckCircle size={48} color="#22c55e" style={{ margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ fontWeight: 600, color: '#111', marginBottom: 8 }}>Password updated successfully</p>
                        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => navigate('/login')}>
                            Go to Sign In
                        </button>
                    </div>
                )}

                {status === 'valid' && (
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">New Password</label>
                            <input
                                className="form-control"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                            {password && (
                                <div style={{ marginTop: 6 }}>
                                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= strength ? strengthColor[strength] : '#e5e7eb' }} />
                                        ))}
                                    </div>
                                    <span style={{ fontSize: 11, color: strengthColor[strength] }}>{strengthLabel[strength]}</span>
                                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Min 8 chars, uppercase, lowercase, number, special char</div>
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label className="form-label">Confirm Password</label>
                            <input
                                className="form-control"
                                type="password"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', justifyContent: 'center', padding: 11 }}
                            disabled={loading}
                        >
                            {loading ? 'Saving...' : 'Set New Password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
