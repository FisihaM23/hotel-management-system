import { useState } from 'react'
import toast from 'react-hot-toast'
import { updateUser } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function Profile() {
    const { user, loginUser } = useAuth()
    const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', password: '', confirm: '' })
    const [saving, setSaving] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (form.password && form.password !== form.confirm) return toast.error('Passwords do not match')
        setSaving(true)
        try {
            const payload = { name: form.name, phone: form.phone }
            if (form.password) payload.password = form.password
            await updateUser(user.id, payload)
            loginUser(localStorage.getItem('hms_token'), { ...user, name: form.name, phone: form.phone })
            toast.success('Profile updated')
            setForm(f => ({ ...f, password: '', confirm: '' }))
        } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
        finally { setSaving(false) }
    }

    const roleColors = { admin: '#ef4444', manager: '#8b5cf6', receptionist: '#3b82f6', customer: '#10b981', housekeeping: '#f59e0b', maintenance: '#6b7280' }

    return (
        <div style={{ maxWidth: 560 }}>
            <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: roleColors[user?.role] || '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 700 }}>
                        {user?.name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 style={{ fontSize: 20, fontWeight: 700 }}>{user?.name}</h3>
                        <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, textTransform: 'capitalize', background: roleColors[user?.role] + '22', color: roleColors[user?.role] }}>{user?.role}</span>
                        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{user?.email}</div>
                    </div>
                </div>
            </div>

            <div className="card">
                <h3 style={{ marginBottom: 20, fontWeight: 600 }}>Edit Profile</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input className="form-control" value={user?.email} disabled style={{ background: '#f9fafb', color: '#9ca3af' }} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Phone</label>
                        <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16, marginTop: 8 }}>
                        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Change password (leave blank to keep current)</p>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">New Password</label>
                                <input className="form-control" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Confirm Password</label>
                                <input className="form-control" type="password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} />
                            </div>
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
                </form>
            </div>
        </div>
    )
}
