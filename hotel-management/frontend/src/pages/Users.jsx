import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { getUsers, createUser, updateUser, deleteUser } from '../services/api'

const roleBadge = { admin: 'badge-danger', manager: 'badge-info', receptionist: 'badge-info', customer: 'badge-success', housekeeping: 'badge-warning', maintenance: 'badge-gray' }
const emptyForm = { name: '', email: '', password: '', role: 'receptionist', phone: '', status: 'active' }

export default function Users() {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editId, setEditId] = useState(null)
    const [search, setSearch] = useState('')
    const [filterRole, setFilterRole] = useState('all')
    const [saving, setSaving] = useState(false)

    const load = () => {
        setLoading(true)
        getUsers().then(r => setUsers(r.data)).catch(() => toast.error('Failed to load users')).finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal(true) }
    const openEdit = (u) => {
        setForm({ name: u.name, email: u.email, password: '', role: u.role, phone: u.phone || '', status: u.status })
        setEditId(u.id); setModal(true)
    }
    const closeModal = () => { setModal(false); setForm(emptyForm); setEditId(null) }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const payload = { ...form }
            if (editId && !payload.password) delete payload.password
            editId ? await updateUser(editId, payload) : await createUser(payload)
            toast.success(editId ? 'User updated' : 'User created')
            closeModal(); load()
        } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
        finally { setSaving(false) }
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this user?')) return
        try { await deleteUser(id); toast.success('User deleted'); load() }
        catch { toast.error('Failed to delete') }
    }

    const filtered = users.filter(u =>
        (filterRole === 'all' || u.role === filterRole) &&
        (!search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    )

    return (
        <div>
            <div className="page-header">
                <h2>User Management</h2>
                <button className="btn btn-primary" onClick={openAdd}><Plus size={16} />Add User</button>
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
                    <input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{filtered.length} users</span>
            </div>

            <div className="card">
                {loading ? <div className="loading"><div className="spinner" />Loading...</div> : (
                    <div className="table-container">
                        <table>
                            <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
                            <tbody>
                                {filtered.length === 0
                                    ? <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No users found</td></tr>
                                    : filtered.map(u => (
                                        <tr key={u.id}>
                                            <td>{u.id}</td>
                                            <td style={{ fontWeight: 500 }}>{u.name}</td>
                                            <td>{u.email}</td>
                                            <td>{u.phone || '-'}</td>
                                            <td><span className={`badge ${roleBadge[u.role] || 'badge-gray'}`} style={{ textTransform: 'capitalize' }}>{u.role}</span></td>
                                            <td><span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}`} style={{ textTransform: 'capitalize' }}>{u.status}</span></td>
                                            <td style={{ fontSize: 12 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(u)}><Pencil size={13} /></button>
                                                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(u.id)}><Trash2 size={13} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3>{editId ? 'Edit User' : 'Add User'}</h3>
                            <button className="btn btn-icon btn-outline" onClick={closeModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Full Name *</label>
                                        <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Email *</label>
                                        <input className="form-control" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Password {editId ? '(leave blank to keep)' : '*'}</label>
                                        <input className="form-control" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!editId} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Phone</label>
                                        <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Role</label>
                                        <select className="form-control" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                            {['admin', 'manager', 'receptionist', 'customer', 'housekeeping', 'maintenance'].map(r => <option key={r} value={r} style={{ textTransform: 'capitalize' }}>{r}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
