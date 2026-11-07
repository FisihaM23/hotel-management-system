import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Hotel, Shield, Send, CheckCircle2, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { register, requestAccount, login } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { isValidEmail, EMAIL_POLICY_MESSAGE } from '../utils/validation'
import ThemeSelector from '../components/ThemeSelector'

export default function Register() {
    const [mode, setMode] = useState('request') // 'request' | 'register'
    const [requestSent, setRequestSent] = useState(false)
    const [reqForm, setReqForm] = useState({ name: '', email: '', phone: '', role: 'customer', notes: '' })
    const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' })
    const [loading, setLoading] = useState(false)
    const [focusedFields, setFocusedFields] = useState({})
    const handleFocus = (field) => setFocusedFields(prev => ({ ...prev, [field]: true }))
    const navigate = useNavigate()
    const { loginUser } = useAuth()

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

    const handleAccountRequest = async (e) => {
        e.preventDefault()
        if (!isValidEmail(reqForm.email)) {
            return toast.error(EMAIL_POLICY_MESSAGE)
        }
        setLoading(true)
        try {
            await requestAccount(reqForm)
            setRequestSent(true)
            toast.success('Account request submitted to Admin Mulugeta Fisiha!')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to submit request')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!isValidEmail(form.email)) {
            return toast.error(EMAIL_POLICY_MESSAGE)
        }
        if (form.password !== form.confirm) return toast.error('Passwords do not match')
        if (strength < 4) return toast.error('Password does not meet security requirements')
        setLoading(true)
        try {
            const regRes = await register({ name: form.name, email: form.email, phone: form.phone, password: form.password })
            if (regRes?.data?.email_sent) {
                if (regRes.data.sandbox_mode) {
                    toast.success('✉️ Welcome email dispatched & notification active!')
                } else {
                    toast.success('✉️ Welcome email sent to your inbox!')
                }
            }
            // Direct seamless login using the token and user payload returned by the register endpoint
            const sessionToken = regRes?.data?.token
            const sessionUser = regRes?.data?.user
            if (sessionToken && sessionUser) {
                loginUser(sessionToken, sessionUser)
                toast.success(`🎉 Welcome to Grand Hotel, ${sessionUser.name}! Enjoy your stay.`)
                setTimeout(() => { window.location.href = '/' }, 500)
                return
            }

            // Auto-login fallback if token was not in register response
            try {
                const loginRes = await login({ email: form.email.trim(), password: form.password })
                const { token, user } = loginRes.data
                if (token && user) {
                    loginUser(token, user)
                    toast.success(`🎉 Welcome to Grand Hotel, ${user.name}! Enjoy your stay.`)
                    setTimeout(() => { window.location.href = '/' }, 500)
                    return
                }
            } catch (loginErr) {
                console.warn('Auto-login error:', loginErr)
            }
            toast.success('Registration successful! Please login.')
            navigate('/login')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Registration failed')
        } finally { setLoading(false) }
    }

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

            <div className="login-card" style={{ maxWidth: 480, boxShadow: 'none' }}>
                <div className="login-logo">
                    <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <Hotel size={34} color="#fff" />
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--tp-ink)' }}>Account Provisioning</h1>
                    <p style={{ color: 'var(--tp-mute)', fontSize: 13 }}>Hotel Management System</p>
                </div>

                {/* Empty pure black (#000000) space replacing policy/demo banner */}
                <div
                    style={{
                        width: '100%',
                        height: 48,
                        background: '#000000',
                        borderRadius: 10,
                        marginBottom: 16
                    }}
                    aria-hidden="true"
                />

                {/* Sub-modes: Request from Admin vs Self-Register Customer */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <button
                        type="button"
                        onClick={() => setMode('request')}
                        className={`btn btn-sm ${mode === 'request' ? 'btn-primary' : 'btn-outline'}`}
                        style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}
                    >
                        Request Account from Admin
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('register')}
                        className={`btn btn-sm ${mode === 'register' ? 'btn-primary' : 'btn-outline'}`}
                        style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}
                    >
                        Guest Registration
                    </button>
                </div>

                {mode === 'request' ? (
                    requestSent ? (
                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                            <CheckCircle2 size={44} color="#16a34a" style={{ margin: '0 auto 10px' }} />
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tp-ink)', marginBottom: 6 }}>Request Submitted</h3>
                            <p style={{ fontSize: 13, color: 'var(--tp-mute)', marginBottom: 16 }}>
                                Your request was delivered to Administrator <strong>Mulugeta Fisiha</strong>. You will receive account access details upon verification.
                            </p>
                            <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none', fontWeight: 700 }}>
                                Go to Sign In
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleAccountRequest} autoComplete="off">
                            {/* Chrome autofill suppression decoys */}
                            <input
                                type="text"
                                name="fake_reg_user"
                                tabIndex={-1}
                                autoComplete="off"
                                style={{ position: 'fixed', top: '-9999px', left: '-9999px', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                                aria-hidden="true"
                            />
                            <div className="form-group">
                                <label className="form-label">Full Name *</label>
                                <input
                                    className="form-control"
                                    name="hms_reg_pg_name"
                                    autoComplete="off"
                                    value={reqForm.name}
                                    onChange={e => setReqForm({ ...reqForm, name: e.target.value })}
                                    placeholder="Full name"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email Address *</label>
                                <input
                                    className="form-control"
                                    type="email"
                                    name="hms_reg_pg_email"
                                    id="hms_reg_pg_email"
                                    autoComplete="off"
                                    readOnly={!focusedFields.reqEmail}
                                    onFocus={() => handleFocus('reqEmail')}
                                    value={reqForm.email}
                                    onChange={e => setReqForm({ ...reqForm, email: e.target.value })}
                                    placeholder="Email address"
                                    required
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Phone</label>
                                    <input
                                        className="form-control"
                                        name="hms_reg_pg_phone"
                                        autoComplete="off"
                                        value={reqForm.phone}
                                        onChange={e => setReqForm({ ...reqForm, phone: e.target.value })}
                                        placeholder="Phone number"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Requested Role</label>
                                    <select
                                        className="form-control"
                                        value={reqForm.role}
                                        onChange={e => setReqForm({ ...reqForm, role: e.target.value })}
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
                                <label className="form-label">Purpose / Room Booking / Department</label>
                                <input
                                    className="form-control"
                                    value={reqForm.notes}
                                    onChange={e => setReqForm({ ...reqForm, notes: e.target.value })}
                                    placeholder="Booking reference, notes, or department"
                                />
                            </div>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                style={{ width: '100%', justifyContent: 'center', padding: 11, fontSize: 14, fontWeight: 700 }}
                                disabled={loading}
                            >
                                <Send size={14} style={{ marginRight: 6 }} />
                                {loading ? 'Submitting...' : 'Submit Request to Administrator'}
                            </button>

                            {/* Empty pure black (#000000) credentials display space */}
                            <div
                                style={{
                                    width: '100%',
                                    height: 40,
                                    background: '#000000',
                                    borderRadius: 8,
                                    marginTop: 16
                                }}
                                aria-hidden="true"
                            />
                        </form>
                    )
                ) : (
                    <form onSubmit={handleSubmit} autoComplete="off">
                        {/* Chrome autofill suppression decoys */}
                        <input
                            type="text"
                            name="fake_page_reg_user"
                            tabIndex={-1}
                            autoComplete="username"
                            style={{ position: 'fixed', top: '-9999px', left: '-9999px', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                            aria-hidden="true"
                        />
                        <input
                            type="password"
                            name="fake_page_reg_pass"
                            tabIndex={-1}
                            autoComplete="current-password"
                            style={{ position: 'fixed', top: '-9999px', left: '-9999px', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                            aria-hidden="true"
                        />
                        <div className="form-group">
                            <label className="form-label">Full Name *</label>
                            <input
                                className="form-control"
                                name="hms_pg_reg_name"
                                autoComplete="off"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                placeholder="Full name"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Email Address *</label>
                            <input
                                className="form-control"
                                type="email"
                                name="hms_pg_reg_email"
                                id="hms_pg_reg_email"
                                autoComplete="off"
                                readOnly={!focusedFields.regEmail}
                                onFocus={() => handleFocus('regEmail')}
                                placeholder="Email address"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Phone</label>
                            <input
                                className="form-control"
                                name="hms_pg_reg_phone"
                                autoComplete="off"
                                value={form.phone}
                                onChange={e => setForm({ ...form, phone: e.target.value })}
                                placeholder="Phone number"
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Password *</label>
                                <input
                                    className="form-control"
                                    type="password"
                                    name="hms_pg_reg_password"
                                    id="hms_pg_reg_password"
                                    autoComplete="new-password"
                                    readOnly={!focusedFields.regPass}
                                    onFocus={() => handleFocus('regPass')}
                                    value={form.password}
                                    onChange={e => setForm({ ...form, password: e.target.value })}
                                    placeholder="Password"
                                    required
                                />
                                {form.password && (
                                    <div style={{ marginTop: 6 }}>
                                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                            {[1, 2, 3, 4, 5].map(i => (
                                                <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= strength ? strengthColor[strength] : 'var(--tp-line)' }} />
                                            ))}
                                        </div>
                                        <span style={{ fontSize: 11, color: strengthColor[strength], fontWeight: 700 }}>{strengthLabel[strength]}</span>
                                        <div style={{ fontSize: 11, color: 'var(--tp-mute)', marginTop: 2 }}>Min 8 chars, uppercase, lowercase, number, special char</div>
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label className="form-label">Confirm Password *</label>
                                <input
                                    className="form-control"
                                    type="password"
                                    name="hms_pg_reg_confirm"
                                    id="hms_pg_reg_confirm"
                                    autoComplete="new-password"
                                    readOnly={!focusedFields.regConf}
                                    onFocus={() => handleFocus('regConf')}
                                    value={form.confirm}
                                    onChange={e => setForm({ ...form, confirm: e.target.value })}
                                    placeholder="Confirm password"
                                    required
                                />
                            </div>
                        </div>
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 11, fontWeight: 700 }} disabled={loading}>
                            {loading ? 'Registering...' : 'Create Guest Account'}
                        </button>

                        {/* Empty pure black (#000000) credentials display space */}
                        <div
                            style={{
                                width: '100%',
                                height: 40,
                                background: '#000000',
                                borderRadius: 8,
                                marginTop: 16
                            }}
                            aria-hidden="true"
                        />
                    </form>
                )}

                <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--tp-mute)' }}>
                    Already have credentials? <Link to="/login" style={{ color: 'var(--tp-acc)', fontWeight: 700 }}>Sign in</Link>
                </div>
            </div>
        </div>
    )
}
