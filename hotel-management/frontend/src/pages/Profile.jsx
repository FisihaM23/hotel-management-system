import { useState, useEffect } from 'react'
import { KeyRound, ShieldCheck, Eye, EyeOff, Mail, Lock, CheckCircle2, RotateCcw, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { updateMyProfile, requestChangePasswordOtp, verifyChangePasswordOtp, changePasswordWithOtp } from '../services/api'
import { useAuth } from '../context/AuthContext'
import safeStorage from '../utils/storage'
import ThemeSelector from '../components/ThemeSelector'

export default function Profile() {
    const { user, loginUser } = useAuth()
    const [profileForm, setProfileForm] = useState({ name: user?.name || '', phone: user?.phone || '' })
    const [savingProfile, setSavingProfile] = useState(false)

    // Change Password Multi-Step State: 'idle' | 'otp_sent' | 'verified' | 'success'
    const [pwStep, setPwStep] = useState('idle')
    const [otpCode, setOtpCode] = useState('')
    const [changeToken, setChangeToken] = useState('')
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showCurrentPw, setShowCurrentPw] = useState(false)
    const [showNewPw, setShowNewPw] = useState(false)
    const [showConfirmPw, setShowConfirmPw] = useState(false)
    const [loadingPw, setLoadingPw] = useState(false)
    const [resendCooldown, setResendCooldown] = useState(0)

    // 60-second cooldown countdown timer
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

    // Password strength rules check
    const checkRules = (pw) => ({
        length: pw.length >= 8,
        upper: /[A-Z]/.test(pw),
        lower: /[a-z]/.test(pw),
        num: /[0-9]/.test(pw),
        sym: /[\W_]/.test(pw)
    })
    const pwRules = checkRules(newPassword)
    const pwStrength = Object.values(pwRules).filter(Boolean).length
    const strengthLabel = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
    const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a']

    // 1. Handle Profile Info Update (Name & Phone)
    const handleProfileSubmit = async (e) => {
        e.preventDefault()
        setSavingProfile(true)
        try {
            await updateMyProfile({ name: profileForm.name, phone: profileForm.phone })
            loginUser(safeStorage.getItem('hms_token'), { ...user, name: profileForm.name, phone: profileForm.phone })
            toast.success('Profile updated successfully')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update profile')
        } finally {
            setSavingProfile(false)
        }
    }

    // 2. Step 1: Request Change Password OTP
    const handleRequestOtp = async () => {
        if (resendCooldown > 0) return
        setLoadingPw(true)
        try {
            const res = await requestChangePasswordOtp()
            toast.success(res.data?.message || 'Verification code sent to your registered email')
            setPwStep('otp_sent')
            setResendCooldown(60)
            setOtpCode('')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to dispatch verification code')
        } finally {
            setLoadingPw(false)
        }
    }

    // 3. Step 2: Verify OTP
    const handleVerifyOtp = async (e) => {
        e?.preventDefault()
        const cleanOtp = otpCode.trim()
        if (cleanOtp.length !== 6) {
            return toast.error('Please enter the full 6-digit verification code')
        }
        setLoadingPw(true)
        try {
            const res = await verifyChangePasswordOtp({ otp: cleanOtp })
            const token = res.data?.change_token
            if (!token) throw new Error('Did not receive authorization token')
            setChangeToken(token)
            setPwStep('verified')
            toast.success('Verification code confirmed! You can now set your new password.')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Invalid or expired verification code')
        } finally {
            setLoadingPw(false)
        }
    }

    // 4. Step 3: Change Password
    const handleChangePasswordSubmit = async (e) => {
        e.preventDefault()
        if (!currentPassword) {
            return toast.error('Please enter your current password')
        }
        if (newPassword !== confirmPassword) {
            return toast.error('New passwords do not match')
        }
        if (pwStrength < 5) {
            return toast.error('New password must fulfill all 5 security requirements')
        }
        setLoadingPw(true)
        try {
            const res = await changePasswordWithOtp({
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword,
                change_token: changeToken
            })
            toast.success(res.data?.message || 'Your password has been changed successfully.')
            setPwStep('success')
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setChangeToken('')
            setOtpCode('')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to change password')
        } finally {
            setLoadingPw(false)
        }
    }

    const resetPwWorkflow = () => {
        setPwStep('idle')
        setOtpCode('')
        setChangeToken('')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
    }

    const roleColors = { admin: '#ef4444', manager: '#8b5cf6', receptionist: '#3b82f6', customer: '#10b981', housekeeping: '#f59e0b', maintenance: '#6b7280' }

    return (
        <div style={{ maxWidth: 640 }}>
            {/* User Header Profile Card */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    {user?.email === 'befather7@gmail.com' ? (
                        <div className="profile-dev-avatar-container">
                            <img
                                src="/mulugeta.jpg"
                                alt="Mulugeta Fisiha"
                                className="profile-dev-avatar-img"
                                onError={(e) => { e.target.style.display = 'none' }}
                            />
                        </div>
                    ) : (
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: roleColors[user?.role] || '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 700 }}>
                            {user?.name?.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <h3 style={{ fontSize: 20, fontWeight: 700 }}>{user?.name}</h3>
                            {user?.email === 'befather7@gmail.com' && (
                                <span className="dev-mini-pill" style={{ fontSize: 11, padding: '2px 8px' }}>Developer</span>
                            )}
                        </div>
                        <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, textTransform: 'capitalize', background: roleColors[user?.role] + '22', color: roleColors[user?.role], display: 'inline-block', marginTop: 4 }}>
                            {user?.role}
                        </span>
                        <div style={{ fontSize: 13, color: 'var(--tp-mute, #6b7280)', marginTop: 4 }}>{user?.email}</div>
                    </div>
                </div>
            </div>

            {/* Interface Theme Customizer */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Interface Color Theme</h3>
                        <p style={{ fontSize: 12, color: 'var(--tp-mute, #86a882)', marginTop: 2 }}>
                            Personalize your dashboard and customer experience colors
                        </p>
                    </div>
                </div>
                <ThemeSelector variant="pills" />
            </div>

            {/* General Profile Information */}
            <div className="card" style={{ marginBottom: 20 }}>
                <h3 style={{ marginBottom: 16, fontWeight: 700, fontSize: 16 }}>Edit Profile Details</h3>
                <form onSubmit={handleProfileSubmit}>
                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input
                            className="form-control"
                            value={profileForm.name}
                            onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Registered Email Address</label>
                        <input
                            className="form-control"
                            value={user?.email || ''}
                            disabled
                            style={{ background: 'var(--tp-surf, #0c130c)', opacity: 0.8 }}
                        />
                        <div style={{ fontSize: 11, color: 'var(--tp-mute)', marginTop: 4 }}>
                            Verified system identifier. Used for receiving security verification codes.
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Phone Number</label>
                        <input
                            className="form-control"
                            value={profileForm.phone}
                            onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                            placeholder="+251 9..."
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                        {savingProfile ? 'Saving...' : 'Save Profile Changes'}
                    </button>
                </form>
            </div>

            {/* Secure OTP-Authenticated Change Password Section */}
            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#d4af37,#996515)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <KeyRound size={20} color="#050805" />
                    </div>
                    <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Security & Change Password</h3>
                        <p style={{ fontSize: 12, color: 'var(--tp-mute, #6b7280)', margin: '2px 0 0' }}>
                            Two-factor email OTP authentication protects your credentials
                        </p>
                    </div>
                </div>

                {/* ── STEP 1: INITIAL STATE (Request OTP) ── */}
                {pwStep === 'idle' && (
                    <div style={{ background: 'var(--tp-surf-2, #142014)', border: '1px solid var(--tp-line)', borderRadius: 12, padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                            <ShieldCheck size={22} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
                            <div>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tp-ink)' }}>
                                    Email Verification Required
                                </div>
                                <p style={{ fontSize: 12.5, color: 'var(--tp-mute)', margin: '4px 0 0', lineHeight: 1.5 }}>
                                    To change your password, a secure 6-digit verification code must be sent to your registered email: <strong>{maskEmail(user?.email)}</strong>. The code will expire in <strong>10 minutes</strong>.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleRequestOtp}
                            disabled={loadingPw || resendCooldown > 0}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontWeight: 700 }}
                        >
                            <Mail size={16} />
                            <span>{loadingPw ? 'Dispatching Verification Code...' : (resendCooldown > 0 ? `Wait ${resendCooldown}s to Resend` : 'Send Verification Code to Email')}</span>
                        </button>
                    </div>
                )}

                {/* ── STEP 2: VERIFY OTP STATE ── */}
                {pwStep === 'otp_sent' && (
                    <div style={{ background: 'var(--tp-surf-2, #142014)', border: '1px solid var(--tp-line)', borderRadius: 12, padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Mail size={18} color="#22c55e" />
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tp-ink)' }}>Enter 6-Digit Code</span>
                            </div>
                            <button
                                type="button"
                                onClick={resetPwWorkflow}
                                style={{ background: 'none', border: 'none', color: 'var(--tp-mute)', cursor: 'pointer', fontSize: 12 }}
                            >
                                Cancel
                            </button>
                        </div>

                        <p style={{ fontSize: 12.5, color: 'var(--tp-mute)', marginBottom: 16, lineHeight: 1.5 }}>
                            We sent a 6-digit verification code to <strong>{maskEmail(user?.email)}</strong>. Code expires in <strong>10 minutes</strong>.
                        </p>

                        <form onSubmit={handleVerifyOtp}>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">6-Digit Verification Code</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    placeholder="••••••"
                                    value={otpCode}
                                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="form-control"
                                    style={{
                                        maxWidth: 220,
                                        fontSize: 22,
                                        fontWeight: 800,
                                        letterSpacing: 6,
                                        textAlign: 'center',
                                        fontFamily: 'monospace'
                                    }}
                                    autoFocus
                                    required
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={loadingPw || otpCode.length !== 6}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontWeight: 700 }}
                                >
                                    <span>{loadingPw ? 'Verifying Code...' : 'Verify Code & Continue'}</span>
                                    <ArrowRight size={15} />
                                </button>

                                <button
                                    type="button"
                                    onClick={handleRequestOtp}
                                    disabled={loadingPw || resendCooldown > 0}
                                    className="btn btn-outline"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: 12 }}
                                >
                                    <RotateCcw size={14} />
                                    <span>{resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : 'Resend Code'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ── STEP 3: CHANGE PASSWORD FORM (OTP VERIFIED) ── */}
                {pwStep === 'verified' && (
                    <div style={{ background: 'var(--tp-surf-2, #142014)', border: '1px solid #22c55e', borderRadius: 12, padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: '#22c55e' }}>
                            <CheckCircle2 size={18} />
                            <span style={{ fontSize: 13.5, fontWeight: 700 }}>OTP Verified! Enter Passwords Below</span>
                        </div>

                        <form onSubmit={handleChangePasswordSubmit}>
                            {/* Current Password Field */}
                            <div className="form-group" style={{ marginBottom: 14 }}>
                                <label className="form-label">Current Password *</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showCurrentPw ? 'text' : 'password'}
                                        className="form-control"
                                        placeholder="Enter your current password"
                                        value={currentPassword}
                                        onChange={e => setCurrentPassword(e.target.value)}
                                        style={{ paddingRight: 40 }}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tp-mute)' }}
                                    >
                                        {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* New Password Field */}
                            <div className="form-group" style={{ marginBottom: 14 }}>
                                <label className="form-label">New Password *</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showNewPw ? 'text' : 'password'}
                                        className="form-control"
                                        placeholder="Min 8 chars, mixed case, number & symbol"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        style={{ paddingRight: 40 }}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPw(!showNewPw)}
                                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tp-mute)' }}
                                    >
                                        {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>

                                {/* Password Strength Meter */}
                                {newPassword && (
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                            {[1, 2, 3, 4, 5].map(i => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        flex: 1,
                                                        height: 4,
                                                        borderRadius: 2,
                                                        background: i <= pwStrength ? strengthColor[pwStrength] : 'var(--tp-line)'
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
                                            <span style={{ color: strengthColor[pwStrength] }}>{strengthLabel[pwStrength]}</span>
                                            <span style={{ color: 'var(--tp-mute)' }}>Must fulfill all 5 rules</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6, fontSize: 11, color: 'var(--tp-mute)' }}>
                                            <span style={{ color: pwRules.length ? '#22c55e' : 'inherit' }}>{pwRules.length ? '✓' : '○'} At least 8 characters</span>
                                            <span style={{ color: pwRules.upper ? '#22c55e' : 'inherit' }}>{pwRules.upper ? '✓' : '○'} Uppercase letter</span>
                                            <span style={{ color: pwRules.lower ? '#22c55e' : 'inherit' }}>{pwRules.lower ? '✓' : '○'} Lowercase letter</span>
                                            <span style={{ color: pwRules.num ? '#22c55e' : 'inherit' }}>{pwRules.num ? '✓' : '○'} Number (0-9)</span>
                                            <span style={{ color: pwRules.sym ? '#22c55e' : 'inherit' }}>{pwRules.sym ? '✓' : '○'} Special symbol</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Confirm New Password Field */}
                            <div className="form-group" style={{ marginBottom: 18 }}>
                                <label className="form-label">Confirm New Password *</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showConfirmPw ? 'text' : 'password'}
                                        className="form-control"
                                        placeholder="Repeat new password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        style={{ paddingRight: 40 }}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPw(!showConfirmPw)}
                                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tp-mute)' }}
                                    >
                                        {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={loadingPw || pwStrength < 5 || newPassword !== confirmPassword}
                                    style={{ padding: '10px 22px', fontWeight: 700 }}
                                >
                                    {loadingPw ? 'Updating Password...' : 'Save New Password'}
                                </button>
                                <button
                                    type="button"
                                    onClick={resetPwWorkflow}
                                    className="btn btn-outline"
                                    disabled={loadingPw}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ── STEP 4: SUCCESS STATE ── */}
                {pwStep === 'success' && (
                    <div style={{ background: 'rgba(34,197,94,0.1)', border: '1.5px solid #22c55e', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                        <CheckCircle2 size={40} color="#22c55e" style={{ margin: '0 auto 10px' }} />
                        <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tp-ink)', margin: '0 0 6px' }}>
                            Your password has been changed successfully.
                        </h4>
                        <p style={{ fontSize: 13, color: 'var(--tp-mute)', margin: '0 0 16px', lineHeight: 1.5 }}>
                            Your account security credentials are updated. You can now use your new password for all future sign-ins across the Hotel Management System.
                        </p>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={resetPwWorkflow}
                            style={{ fontWeight: 700, padding: '8px 18px' }}
                        >
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

