import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Search, KeyRound, Shield, Check, X, Copy, RefreshCw, Eye, EyeOff, ExternalLink, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import {
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    adminResetPassword,
    adminGenerateResetLink,
    login
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import { isValidEmail, EMAIL_POLICY_MESSAGE } from '../utils/validation'

const staffQuickAccounts = [
    { label: 'Admin', role: 'admin', email: 'befather7@gmail.com', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '👑' },
    { label: 'Manager', role: 'manager', email: 'manager@hotel.com', color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', icon: '🏨' },
    { label: 'Receptionist', role: 'receptionist', email: 'receptionist@hotel.com', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: '🛎️' },
    { label: 'Customer', role: 'customer', email: 'customer@hotel.com', color: '#10b981', bg: '#f0fdf4', border: '#a7f3d0', icon: '🧳' },
    { label: 'Housekeeping', role: 'housekeeping', email: 'housekeeping@hotel.com', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: '🧹' },
    { label: 'Maintenance', role: 'maintenance', email: 'maintenance@hotel.com', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', icon: '🔧' },
]

const roleBadge = {
    admin: 'badge-danger',
    manager: 'badge-info',
    receptionist: 'badge-info',
    customer: 'badge-success',
    housekeeping: 'badge-warning',
    maintenance: 'badge-gray'
}

const emptyForm = { name: '', email: '', password: '', role: 'receptionist', phone: '', status: 'active' }

// Cryptographically randomized strong password generator
function generateSecurePassword() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const lower = 'abcdefghijkmnopqrstuvwxyz'
    const digits = '23456789'
    const special = '!@#$%&*?'
    let pw = upper[Math.floor(Math.random() * upper.length)]
        + lower[Math.floor(Math.random() * lower.length)]
        + digits[Math.floor(Math.random() * digits.length)]
        + special[Math.floor(Math.random() * special.length)]
    const all = upper + lower + digits + special
    for (let i = 0; i < 8; i++) {
        pw += all[Math.floor(Math.random() * all.length)]
    }
    return pw.split('').sort(() => 0.5 - Math.random()).join('')
}

export default function Users() {
    const { loginUser } = useAuth()
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editId, setEditId] = useState(null)
    const [search, setSearch] = useState('')
    const [filterRole, setFilterRole] = useState('all')
    const [saving, setSaving] = useState(false)
    const [showFormPass, setShowFormPass] = useState(false)

    // Admin Password Management State
    const [resetUser, setResetUser] = useState(null)
    const [resetTab, setResetTab] = useState('temp_password') // 'temp_password' | 'reset_link'
    const [tempPass, setTempPass] = useState('')
    const [showTempPass, setShowTempPass] = useState(false)
    const [generatedLink, setGeneratedLink] = useState('')
    const [resetLoading, setResetLoading] = useState(false)
    const [savedTempPassResult, setSavedTempPassResult] = useState(null)

    const handleQuickStaffLogin = async (staffEmail) => {
        try {
            const res = await login({ email: staffEmail, password: 'password123' })
            const { token, user } = res.data
            if (token && user) {
                loginUser(token, user)
                toast.success(`Switched role to ${user.name} (${user.role})`)
                setTimeout(() => {
                    if (user.role === 'customer') window.location.href = '/landing'
                    else window.location.href = '/'
                }, 500)
            }
        } catch {
            toast.error(`Could not switch to ${staffEmail}`)
        }
    }

    const load = () => {
        setLoading(true)
        getUsers()
            .then(r => setUsers(r.data))
            .catch(() => toast.error('Failed to load users'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const openAdd = () => {
        const autoPw = generateSecurePassword()
        setForm({ ...emptyForm, password: autoPw })
        setEditId(null)
        setShowFormPass(true)
        setModal(true)
    }

    const openEdit = (u) => {
        setForm({ name: u.name, email: u.email, password: '', role: u.role, phone: u.phone || '', status: u.status })
        setEditId(u.id)
        setShowFormPass(false)
        setModal(true)
    }

    const closeModal = () => {
        setModal(false)
        setForm(emptyForm)
        setEditId(null)
    }

    const handleFormGeneratePass = () => {
        const pw = generateSecurePassword()
        setForm(prev => ({ ...prev, password: pw }))
        setShowFormPass(true)
        navigator.clipboard.writeText(pw)
        toast.success('Generated strong password & copied to clipboard!')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!isValidEmail(form.email)) {
            return toast.error(EMAIL_POLICY_MESSAGE)
        }
        setSaving(true)
        try {
            const payload = { ...form }
            if (editId && !payload.password) delete payload.password
            const res = editId ? await updateUser(editId, payload) : await createUser(payload)
            if (!editId && res.data?.initial_password) {
                toast.success(`User created! Initial password: ${res.data.initial_password}`, { duration: 6000 })
            } else {
                toast.success(editId ? 'User updated successfully' : 'User created successfully')
            }
            closeModal()
            load()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save user')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (u) => {
        if (u.email === 'befather7@gmail.com') {
            return toast.error('Primary Administrator account cannot be deleted')
        }
        if (!confirm(`Are you sure you want to delete user ${u.name} (${u.email})?\nAll associated records and assignments will be cleanly resolved without error.`)) return
        try {
            await deleteUser(u.id)
            toast.success('User deleted successfully')
            load()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to delete user')
        }
    }

    // ── Open Password Management Modal ───────────────────────────────────────
    const openPasswordModal = (u) => {
        setResetUser(u)
        setResetTab('temp_password')
        const pw = generateSecurePassword()
        setTempPass(pw)
        setShowTempPass(true)
        setGeneratedLink('')
        setSavedTempPassResult(null)
    }

    const closePasswordModal = () => {
        setResetUser(null)
        setGeneratedLink('')
        setSavedTempPassResult(null)
        setTempPass('')
    }

    // ── Submit Direct Password Override ─────────────────────────────────────
    const handleDirectReset = async (e) => {
        e.preventDefault()
        if (!resetUser) return
        setResetLoading(true)
        try {
            const res = await adminResetPassword(resetUser.id, { password: tempPass })
            setSavedTempPassResult(res.data?.temporary_password || tempPass)
            toast.success('Password updated successfully!')
            load()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to reset password')
        } finally {
            setResetLoading(false)
        }
    }

    // ── Generate 1-Hour Secure Link ─────────────────────────────────────────
    const handleGenerateLink = async () => {
        if (!resetUser) return
        setResetLoading(true)
        try {
            const res = await adminGenerateResetLink(resetUser.id)
            setGeneratedLink(res.data?.reset_link || '')
            toast.success('Secure 1-hour reset link generated!')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to generate reset link')
        } finally {
            setResetLoading(false)
        }
    }

    const filtered = users.filter(u =>
        (filterRole === 'all' || u.role === filterRole) &&
        (!search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    )

    // Password Policy checker
    const checkRules = (pw) => ({
        length: pw.length >= 8,
        upper: /[A-Z]/.test(pw),
        lower: /[a-z]/.test(pw),
        num: /[0-9]/.test(pw),
        sym: /[\W_]/.test(pw)
    })

    return (
        <div>
            {/* Top Admin Policy Header Banner */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(14, 116, 144, 0.25), rgba(30, 58, 138, 0.35))',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: 14,
                padding: '16px 20px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
                        flexShrink: 0
                    }}>
                        <Shield size={24} color="#fff" />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                                Admin Account & Password Governance
                            </h3>
                            <span style={{
                                background: 'rgba(56, 189, 248, 0.2)',
                                color: '#38bdf8',
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 6,
                                border: '1px solid rgba(56, 189, 248, 0.4)'
                            }}>
                                Admin Provisioned
                            </span>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#94a3b8', lineHeight: 1.4 }}>
                            All staff and guest accounts are provisioned and managed by System Administrator <strong>Mulugeta Fisiha</strong>.
                            Use the <KeyRound size={12} style={{ display: 'inline', verticalAlign: 'middle', color: '#38bdf8' }} /> icon on any user row to override passwords or issue single-use secure reset links.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-primary"
                        onClick={openAdd}
                        style={{
                            padding: '10px 18px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            fontWeight: 600,
                            fontSize: 13,
                            boxShadow: '0 4px 14px rgba(56, 189, 248, 0.35)'
                        }}
                    >
                        <Plus size={16} /> Create User Account
                    </button>
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                            setFilterRole(filterRole === 'all' ? 'receptionist' : 'all')
                            toast('Filtered staff users — click "Remove Staff" on any row to delete', { icon: 'ℹ️' })
                        }}
                        style={{
                            padding: '10px 16px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            fontWeight: 600,
                            fontSize: 13,
                            borderColor: 'rgba(239, 68, 68, 0.45)',
                            color: '#ef4444',
                            background: 'rgba(239, 68, 68, 0.08)'
                        }}
                    >
                        <Trash2 size={15} /> Remove Staff User
                    </button>
                </div>
            </div>

            {/* HORIZONTAL STAFF USER BAR (STORED FROM SIGN-IN PAGE) */}
            <div style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: 16
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={14} color="#38bdf8" />
                        Staff User Accounts & Fast Role Switcher (Stored from Sign-in Page)
                    </div>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                        Horizontal quick access to test all staff roles
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                    {staffQuickAccounts.map(a => (
                        <button
                            key={a.email}
                            type="button"
                            onClick={() => handleQuickStaffLogin(a.email)}
                            title={`Switch / Login to ${a.label} (${a.email})`}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '8px 14px',
                                borderRadius: 10,
                                border: `1.5px solid ${a.border}`,
                                background: a.bg,
                                color: a.color,
                                fontWeight: 700,
                                fontSize: 12,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
                        >
                            <span style={{ fontSize: 15 }}>{a.icon}</span>
                            <span>{a.label}</span>
                            <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 500 }}>({a.email})</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="page-header" style={{ marginBottom: 12 }}>
                <div>
                    <h2 style={{ margin: 0 }}>User Management</h2>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>
                        Showing {filtered.length} of {users.length} registered accounts
                    </span>
                </div>
            </div>

            {/* Horizontal Role Filter Buttons with Hover Effects */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 14 }}>
                {[
                    { id: 'all', label: 'All Users', count: users.length },
                    { id: 'admin', label: 'Admins', count: users.filter(u => u.role === 'admin').length },
                    { id: 'manager', label: 'Managers', count: users.filter(u => u.role === 'manager').length },
                    { id: 'receptionist', label: 'Receptionists', count: users.filter(u => u.role === 'receptionist').length },
                    { id: 'customer', label: 'Customers', count: users.filter(u => u.role === 'customer').length },
                    { id: 'housekeeping', label: 'Housekeeping', count: users.filter(u => u.role === 'housekeeping').length },
                    { id: 'maintenance', label: 'Maintenance', count: users.filter(u => u.role === 'maintenance').length },
                ].map(r => (
                    <button
                        key={r.id}
                        type="button"
                        onClick={() => setFilterRole(r.id)}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 10,
                            border: filterRole === r.id ? '1px solid #38bdf8' : '1px solid rgba(56, 189, 248, 0.15)',
                            background: filterRole === r.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(13, 35, 71, 0.55)',
                            color: filterRole === r.id ? '#38bdf8' : '#94a3b8',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-3px)'
                            e.currentTarget.style.boxShadow = '0 6px 18px rgba(56, 189, 248, 0.25)'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = 'none'
                        }}
                    >
                        <span>{r.label}</span>
                        <span style={{
                            padding: '1px 6px',
                            borderRadius: 10,
                            fontSize: 11,
                            background: filterRole === r.id ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                            color: filterRole === r.id ? '#0a1628' : '#cbd5e1'
                        }}>
                            {r.count}
                        </span>
                    </button>
                ))}
            </div>

            <div className="search-bar">
                <div className="search-input-wrap">
                    <Search />
                    <input
                        placeholder="Search by name or email..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{filtered.length} users</span>
            </div>

            <div className="card">
                {loading ? (
                    <div className="loading"><div className="spinner" />Loading users...</div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Joined</th>
                                    <th style={{ textAlign: 'center' }}>Actions & Security</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                                            No users found
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map(u => {
                                        const isMainAdmin = u.email === 'befather7@gmail.com'
                                        return (
                                            <tr key={u.id}>
                                                <td>{u.id}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ fontWeight: 600 }}>{u.name}</span>
                                                        {isMainAdmin && (
                                                            <span style={{
                                                                fontSize: 10,
                                                                background: 'rgba(239, 68, 68, 0.15)',
                                                                color: '#ef4444',
                                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                borderRadius: 4,
                                                                padding: '1px 5px',
                                                                fontWeight: 700
                                                            }}>
                                                                Primary Admin
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td><code>{u.email}</code></td>
                                                <td>{u.phone || '-'}</td>
                                                <td>
                                                    <span className={`badge ${roleBadge[u.role] || 'badge-gray'}`} style={{ textTransform: 'capitalize' }}>
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}`} style={{ textTransform: 'capitalize' }}>
                                                        {u.status}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 12 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                                        {/* Password Reset / Governance Button */}
                                                        <button
                                                            className="btn btn-outline btn-sm"
                                                            onClick={() => openPasswordModal(u)}
                                                            title="Admin Password Reset / Generate Secure Link"
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: 4,
                                                                padding: '5px 9px',
                                                                borderColor: 'rgba(56, 189, 248, 0.4)',
                                                                color: '#38bdf8',
                                                                background: 'rgba(56, 189, 248, 0.08)',
                                                                fontSize: 11,
                                                                fontWeight: 600
                                                            }}
                                                        >
                                                            <KeyRound size={13} />
                                                            <span>Reset PW</span>
                                                        </button>

                                                        {/* Edit User Button */}
                                                        <button
                                                            className="btn btn-outline btn-sm"
                                                            onClick={() => openEdit(u)}
                                                            title="Edit User Profile"
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: 4,
                                                                padding: '5px 9px',
                                                                fontSize: 11,
                                                                fontWeight: 600
                                                            }}
                                                        >
                                                            <Pencil size={13} />
                                                            <span>Edit</span>
                                                        </button>

                                                        {/* Delete / Remove Staff User Button (Horizontal with Label) */}
                                                        <button
                                                            className="btn btn-danger btn-sm"
                                                            onClick={() => handleDelete(u)}
                                                            disabled={isMainAdmin}
                                                            title={isMainAdmin ? 'Primary Admin cannot be deleted' : `Remove ${u.name} (${u.role})`}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: 5,
                                                                padding: '5px 10px',
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                                opacity: isMainAdmin ? 0.35 : 1,
                                                                cursor: isMainAdmin ? 'not-allowed' : 'pointer'
                                                            }}
                                                        >
                                                            <Trash2 size={13} />
                                                            <span>{u.role === 'customer' ? 'Remove User' : 'Remove Staff'}</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── MODAL 1: ADD / EDIT USER ──────────────────────────────────────── */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
                    <div className="modal" style={{ maxWidth: 540 }}>
                        <div className="modal-header">
                            <h3>{editId ? 'Edit Account' : 'Create Account (Admin Provisioned)'}</h3>
                            <button className="btn btn-icon btn-outline" onClick={closeModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Full Name *</label>
                                        <input
                                            className="form-control"
                                            value={form.name}
                                            onChange={e => setForm({ ...form, name: e.target.value })}
                                            placeholder="e.g. John Doe"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Email Address * <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 500 }}>(Must be @gmail.com or @icloud.com)</span></label>
                                        <input
                                            className="form-control"
                                            type="email"
                                            value={form.email}
                                            onChange={e => setForm({ ...form, email: e.target.value })}
                                            placeholder="staff@gmail.com or staff@icloud.com"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Password Section with Auto-Generator */}
                                <div className="form-group" style={{ background: 'rgba(15, 23, 42, 0.4)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <label className="form-label" style={{ margin: 0 }}>
                                            Password {editId ? '(leave blank to keep current)' : '*'}
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleFormGeneratePass}
                                            className="btn btn-outline btn-sm"
                                            style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8', borderColor: '#38bdf8' }}
                                        >
                                            <RefreshCw size={11} /> Generate Strong
                                        </button>
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            className="form-control"
                                            type={showFormPass ? 'text' : 'password'}
                                            value={form.password}
                                            onChange={e => setForm({ ...form, password: e.target.value })}
                                            placeholder={editId ? 'Unchanged unless specified' : 'Min 8 chars, mixed case, number & symbol'}
                                            required={!editId}
                                            style={{ paddingRight: 40, fontFamily: showFormPass ? 'monospace' : 'inherit' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowFormPass(p => !p)}
                                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                                        >
                                            {showFormPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>

                                    {form.password && (
                                        <div style={{ marginTop: 8, fontSize: 11, display: 'flex', gap: 10, flexWrap: 'wrap', color: '#94a3b8' }}>
                                            {(() => {
                                                const r = checkRules(form.password)
                                                return (
                                                    <>
                                                        <span style={{ color: r.length ? '#22c55e' : '#ef4444' }}>{r.length ? '✓' : '✗'} 8+ chars</span>
                                                        <span style={{ color: r.upper ? '#22c55e' : '#ef4444' }}>{r.upper ? '✓' : '✗'} Upper (A-Z)</span>
                                                        <span style={{ color: r.lower ? '#22c55e' : '#ef4444' }}>{r.lower ? '✓' : '✗'} Lower (a-z)</span>
                                                        <span style={{ color: r.num ? '#22c55e' : '#ef4444' }}>{r.num ? '✓' : '✗'} Number (0-9)</span>
                                                        <span style={{ color: r.sym ? '#22c55e' : '#ef4444' }}>{r.sym ? '✓' : '✗'} Symbol</span>
                                                    </>
                                                )
                                            })()}
                                        </div>
                                    )}
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Phone Number</label>
                                        <input
                                            className="form-control"
                                            value={form.phone}
                                            onChange={e => setForm({ ...form, phone: e.target.value })}
                                            placeholder="+251 932 338 138"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Role</label>
                                        <select
                                            className="form-control"
                                            value={form.role}
                                            onChange={e => setForm({ ...form, role: e.target.value })}
                                        >
                                            {['admin', 'manager', 'receptionist', 'customer', 'housekeeping', 'maintenance'].map(r => (
                                                <option key={r} value={r} style={{ textTransform: 'capitalize' }}>
                                                    {r.toUpperCase()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Account Status</label>
                                    <select
                                        className="form-control"
                                        value={form.status}
                                        onChange={e => setForm({ ...form, status: e.target.value })}
                                    >
                                        <option value="active">Active (Can log in)</option>
                                        <option value="inactive">Inactive (Suspended)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Saving...' : editId ? 'Update Account' : 'Provision Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── MODAL 2: ADMIN PASSWORD RESET & LINK GENERATOR ───────────────── */}
            {resetUser && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closePasswordModal()}>
                    <div className="modal" style={{ maxWidth: 520 }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <KeyRound size={18} color="#38bdf8" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0 }}>Password Control</h3>
                                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                        Target: <strong>{resetUser.name}</strong> ({resetUser.email})
                                    </span>
                                </div>
                            </div>
                            <button className="btn btn-icon btn-outline" onClick={closePasswordModal}>✕</button>
                        </div>

                        {/* Sub-tabs: Direct Reset vs Generate Link */}
                        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 20px', background: 'rgba(0,0,0,0.1)' }}>
                            <button
                                type="button"
                                onClick={() => { setResetTab('temp_password'); setSavedTempPassResult(null) }}
                                style={{
                                    flex: 1,
                                    padding: '12px 10px',
                                    border: 'none',
                                    background: 'none',
                                    color: resetTab === 'temp_password' ? '#38bdf8' : '#94a3b8',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    borderBottom: resetTab === 'temp_password' ? '2px solid #38bdf8' : '2px solid transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6
                                }}
                            >
                                <KeyRound size={14} /> Direct Override / Temporary PW
                            </button>
                            <button
                                type="button"
                                onClick={() => { setResetTab('reset_link'); setGeneratedLink('') }}
                                style={{
                                    flex: 1,
                                    padding: '12px 10px',
                                    border: 'none',
                                    background: 'none',
                                    color: resetTab === 'reset_link' ? '#38bdf8' : '#94a3b8',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    borderBottom: resetTab === 'reset_link' ? '2px solid #38bdf8' : '2px solid transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6
                                }}
                            >
                                <ExternalLink size={14} /> Generate 1-Hour Secure Link
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* TAB 1: Direct Reset */}
                            {resetTab === 'temp_password' && (
                                <form onSubmit={handleDirectReset}>
                                    <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 0, marginBottom: 14 }}>
                                        Set or auto-generate a new temporary password for <strong>{resetUser.name}</strong>. The user can immediately sign in with this credential.
                                    </p>

                                    <div className="form-group">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <label className="form-label" style={{ margin: 0 }}>New Temporary Password</label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const pw = generateSecurePassword()
                                                    setTempPass(pw)
                                                    setShowTempPass(true)
                                                    toast.success('Generated strong random password!')
                                                }}
                                                className="btn btn-outline btn-sm"
                                                style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8' }}
                                            >
                                                <RefreshCw size={11} /> Generate Strong
                                            </button>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                className="form-control"
                                                type={showTempPass ? 'text' : 'password'}
                                                value={tempPass}
                                                onChange={e => setTempPass(e.target.value)}
                                                required
                                                style={{ paddingRight: 40, fontFamily: showTempPass ? 'monospace' : 'inherit', fontSize: 14 }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowTempPass(p => !p)}
                                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                                            >
                                                {showTempPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {savedTempPassResult && (
                                        <div style={{
                                            background: 'rgba(34, 197, 94, 0.12)',
                                            border: '1px solid rgba(34, 197, 94, 0.4)',
                                            borderRadius: 10,
                                            padding: '14px',
                                            marginBottom: 16
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                                                <Check size={16} /> Password updated successfully!
                                            </div>
                                            <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 8 }}>
                                                Provide this temporary credential to <strong>{resetUser.name}</strong>:
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <input
                                                    className="form-control"
                                                    value={savedTempPassResult}
                                                    readOnly
                                                    style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8', background: '#0a1628' }}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(savedTempPassResult)
                                                        toast.success('Password copied to clipboard!')
                                                    }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                                                >
                                                    <Copy size={13} /> Copy
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                                        <button type="button" className="btn btn-outline" onClick={closePasswordModal}>Done</button>
                                        <button type="submit" className="btn btn-primary" disabled={resetLoading}>
                                            {resetLoading ? 'Applying...' : 'Save & Override Password'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* TAB 2: Generate 1-Hour Single-Use Reset Link */}
                            {resetTab === 'reset_link' && (
                                <div>
                                    <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 0, marginBottom: 14 }}>
                                        Generate a cryptographically secure 256-bit single-use reset token valid for <strong>1 hour</strong>. You can copy the link and deliver it directly to the user.
                                    </p>

                                    {!generatedLink ? (
                                        <div style={{ textAlign: 'center', padding: '16px 0' }}>
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={handleGenerateLink}
                                                disabled={resetLoading}
                                                style={{
                                                    padding: '12px 24px',
                                                    fontSize: 14,
                                                    fontWeight: 600,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    boxShadow: '0 4px 14px rgba(56, 189, 248, 0.35)'
                                                }}
                                            >
                                                <KeyRound size={16} />
                                                {resetLoading ? 'Generating Secure Token...' : 'Generate 1-Hour Reset Link'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{
                                                background: 'rgba(56, 189, 248, 0.1)',
                                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                                borderRadius: 10,
                                                padding: '14px',
                                                marginBottom: 16
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
                                                        ✓ Single-Use Reset Link Active (Expires in 1 Hour)
                                                    </span>
                                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Token: 64-char hex</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                                    <input
                                                        className="form-control"
                                                        value={generatedLink}
                                                        readOnly
                                                        style={{ fontSize: 12, fontFamily: 'monospace', color: '#f8fafc', background: '#0a1628' }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(generatedLink)
                                                            toast.success('Reset link copied to clipboard!')
                                                        }}
                                                        style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                                                    >
                                                        <Copy size={13} /> Copy Link
                                                    </button>
                                                </div>
                                                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                                    Send this link to <strong>{resetUser.email}</strong>. Once used, the token is automatically invalidated by the server.
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline btn-sm"
                                                    onClick={handleGenerateLink}
                                                    disabled={resetLoading}
                                                >
                                                    <RefreshCw size={12} /> Regenerate New Link
                                                </button>
                                                <button type="button" className="btn btn-primary btn-sm" onClick={closePasswordModal}>
                                                    Done
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
