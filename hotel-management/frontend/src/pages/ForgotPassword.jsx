import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Hotel, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

const API = 'http://localhost/hotel-management/api'

export default function ForgotPassword() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            await axios.post(`${API}/reset_passwords.php?action=request`, { email })
            setSent(true)
        } catch (err) {
            toast.error(err.response?.data?.error || 'Something went wrong')
        } finally { setLoading(false) }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <Hotel size={34} color="#fff" />
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>Forgot Password</h1>
                    <p style={{ color: '#6b7280', fontSize: 14 }}>We'll send a reset link to your Gmail</p>
                </div>

                {sent ? (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <Mail size={48} color="#22c55e" style={{ margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ fontWeight: 600, color: '#111', marginBottom: 8 }}>Check your email</p>
                        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
                            If <strong>{email}</strong> is registered, a reset link has been sent. Check your inbox (and spam folder).
                        </p>
                        <Link to="/login" style={{ color: '#3b82f6', fontSize: 13 }}>Back to Sign In</Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">Gmail Address</label>
                            <input
                                className="form-control"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="you@gmail.com"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', justifyContent: 'center', padding: 11 }}
                            disabled={loading}
                        >
                            {loading ? 'Sending...' : 'Send Reset Link'}
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
