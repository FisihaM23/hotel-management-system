import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Hotel } from 'lucide-react'
import toast from 'react-hot-toast'
import { register } from '../services/api'

export default function Register() {
    const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' })
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    const getStrength = (pw) => {
        let score = 0
        if (pw.length >= 8) score++
        if (/[A-Z]/.test(pw)) score++
        if (/[a-z]/.test(pw)) score++
        if (/[0-9]/.test(pw)) score++
        if (/[\W_]/.test(pw)) score++
        return score
    }
    const strengthLabel = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
    const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a']
    const strength = getStrength(form.password)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (form.password !== form.confirm) return toast.error('Passwords do not match')
        setLoading(true)
        try {
            await register({ name: form.name, email: form.email, phone: form.phone, password: form.password })
            toast.success('Registration successful! Please login.')
            navigate('/login')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Registration failed')
        } finally { setLoading(false) }
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <Hotel size={48} color="#3b82f6" />
                    <h1>Create Account</h1>
                    <p>Register as a customer</p>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input className="form-control" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Phone</label>
                        <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <input className="form-control" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
                            {form.password && (
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
                            <input className="form-control" type="password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} required />
                        </div>
                    </div>
                    <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={loading}>
                        {loading ? 'Registering...' : 'Create Account'}
                    </button>
                </form>
                <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: '#6b7280' }}>
                    Already have an account? <Link to="/login" style={{ color: '#3b82f6' }}>Sign in</Link>
                </p>
            </div>
        </div>
    )
}
