import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Search, Users, ShieldCheck, Compass } from 'lucide-react'
import toast from 'react-hot-toast'
import { getGuests, createGuest, updateGuest, deleteGuest } from '../services/api'
import { isValidEmail, EMAIL_POLICY_MESSAGE } from '../utils/validation'

const emptyForm = {
    name: '',
    email: '',
    phone: '',
    address: '',
    id_proof: 'National ID',
    id_number: '',
    reason_for_stay: 'Tourism / Leisure'
}

const reasonBadgeColor = {
    'Tourism / Leisure': 'badge-success',
    'Business / Work Trip': 'badge-info',
    'Conference / Event': 'badge-purple',
    'Transit / Layover': 'badge-warning',
    'Personal / Family Visit': 'badge-gray',
    'Medical Stay': 'badge-danger',
    'Official / Government': 'badge-info',
    'Other': 'badge-gray'
}

export default function Guests() {
    const [guests, setGuests] = useState([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editId, setEditId] = useState(null)
    const [search, setSearch] = useState('')
    const [saving, setSaving] = useState(false)

    const load = (q) => {
        setLoading(true)
        getGuests(q)
            .then(res => setGuests(res.data || []))
            .catch(() => toast.error('Failed to load guests'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const handleSearch = (e) => {
        const val = e.target.value
        setSearch(val)
        if (val.length === 0 || val.length >= 2) load(val)
    }

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal(true) }
    const openEdit = (g) => {
        setForm({
            name: g.name || '',
            email: g.email || '',
            phone: g.phone || '',
            address: g.address || '',
            id_proof: g.id_proof || 'National ID',
            id_number: g.id_number || '',
            reason_for_stay: g.reason_for_stay || 'Tourism / Leisure'
        })
        setEditId(g.id)
        setModal(true)
    }
    const closeModal = () => { setModal(false); setForm(emptyForm); setEditId(null) }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!isValidEmail(form.email)) {
            return toast.error(EMAIL_POLICY_MESSAGE)
        }
        setSaving(true)
        try {
            if (editId) {
                await updateGuest(editId, form)
                toast.success('Guest details updated successfully')
            } else {
                await createGuest(form)
                toast.success('Guest registered successfully')
            }
            closeModal()
            load(search)
        } catch (err) {
            toast.error(err.response?.data?.error || 'Operation failed')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (g) => {
        if (!confirm(`Are you sure you want to delete guest "${g.name || 'this guest'}" (${g.email})?\nThis will remove the guest and cleanly resolve any associated bookings, freeing up their rooms.`)) return
        try {
            await deleteGuest(g.id)
            toast.success('Guest deleted successfully')
            load(search)
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to delete guest')
        }
    }

    return (
        <div>
            <div className="page-header">
                <h2>Guest Directory & Registration</h2>
                <button className="btn btn-primary" onClick={openAdd}>
                    <Plus size={16} /> Register Guest
                </button>
            </div>

            <div className="search-bar">
                <div className="search-input-wrap">
                    <Search />
                    <input
                        placeholder="Search by name, email, phone, ID number, or reason for stay..."
                        value={search}
                        onChange={handleSearch}
                    />
                </div>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{guests.length} registered guests</span>
            </div>

            <div className="card">
                {loading ? (
                    <div className="loading"><div className="spinner" /> Loading guests...</div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Guest Name</th>
                                    <th>Contact Info</th>
                                    <th>ID Proof</th>
                                    <th>Reason / Purpose of Stay</th>
                                    <th>Address</th>
                                    <th>Registered</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {guests.length === 0 ? (
                                    <tr>
                                        <td colSpan={8}>
                                            <div className="empty-state">
                                                <Users size={40} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
                                                <p>No guests found</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : guests.map(g => (
                                    <tr key={g.id}>
                                        <td>{g.id}</td>
                                        <td style={{ fontWeight: 600, color: '#111827' }}>{g.name}</td>
                                        <td>
                                            <div style={{ fontSize: 13 }}>{g.email}</div>
                                            <div style={{ fontSize: 12, color: '#6b7280' }}>{g.phone || 'No phone'}</div>
                                        </td>
                                        <td>
                                            <span className="badge badge-info" style={{ fontSize: 11 }}>
                                                {g.id_proof || 'National ID'}
                                            </span>
                                            {g.id_number && (
                                                <div style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace', marginTop: 2 }}>
                                                    {g.id_number}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <span
                                                className={`badge ${reasonBadgeColor[g.reason_for_stay] || 'badge-warning'}`}
                                                style={{ fontSize: 11, fontWeight: 600 }}
                                            >
                                                {g.reason_for_stay || 'Tourism / Leisure'}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 12, color: '#4b5563', maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {g.address || '—'}
                                        </td>
                                        <td style={{ fontSize: 12, color: '#6b7280' }}>
                                            {new Date(g.created_at).toLocaleDateString()}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <button
                                                    className="btn btn-outline btn-sm"
                                                    onClick={() => openEdit(g)}
                                                    title="Edit Guest"
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', fontSize: 12, fontWeight: 600 }}
                                                >
                                                    <Pencil size={13} />
                                                    Edit
                                                </button>
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleDelete(g)}
                                                    title={`Delete ${g.name} and free their rooms`}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, fontWeight: 700, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6 }}
                                                >
                                                    <Trash2 size={13} />
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Standard Guest Registration Modal */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
                    <div className="modal" style={{ maxWidth: 540 }}>
                        <div className="modal-header">
                            <h3>{editId ? 'Edit Guest Record' : 'Register Guest (Format Rule)'}</h3>
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
                                        <label className="form-label">Email Address * <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 500 }}>(Must be @gmail.com or @icloud.com)</span></label>
                                        <input
                                            className="form-control"
                                            type="email"
                                            value={form.email}
                                            onChange={e => setForm({ ...form, email: e.target.value })}
                                            placeholder="guest@gmail.com or guest@icloud.com"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Phone Number</label>
                                        <input
                                            className="form-control"
                                            value={form.phone}
                                            onChange={e => setForm({ ...form, phone: e.target.value })}
                                            placeholder="+251 91 123 4567"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Reason / Purpose of Stay *</label>
                                        <select
                                            className="form-control"
                                            value={form.reason_for_stay}
                                            onChange={e => setForm({ ...form, reason_for_stay: e.target.value })}
                                            required
                                        >
                                            <option value="Tourism / Leisure">🌴 Tourism / Leisure</option>
                                            <option value="Business / Work Trip">💼 Business / Work Trip</option>
                                            <option value="Conference / Event">🎤 Conference / Event</option>
                                            <option value="Transit / Layover">✈️ Transit / Layover</option>
                                            <option value="Personal / Family Visit">👨‍👩‍👦 Personal / Family Visit</option>
                                            <option value="Medical Stay">🏥 Medical Stay</option>
                                            <option value="Official / Government">🏛️ Official / Government</option>
                                            <option value="Other">📌 Other Reason</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">ID Proof Type *</label>
                                        <select
                                            className="form-control"
                                            value={form.id_proof}
                                            onChange={e => setForm({ ...form, id_proof: e.target.value })}
                                            required
                                        >
                                            <option value="National ID">National ID / Kebele ID</option>
                                            <option value="Passport">Passport</option>
                                            <option value="Driver License">Driver's License</option>
                                            <option value="Residence Permit">Residence Permit / Visa</option>
                                            <option value="Student / Work ID">Company / Student ID</option>
                                            <option value="Other">Other ID</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">ID / Document Number</label>
                                        <input
                                            className="form-control"
                                            value={form.id_number}
                                            onChange={e => setForm({ ...form, id_number: e.target.value })}
                                            placeholder="e.g. EP-1234567 or NID-8849"
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Address / Origin</label>
                                    <textarea
                                        className="form-control"
                                        rows={2}
                                        value={form.address}
                                        onChange={e => setForm({ ...form, address: e.target.value })}
                                        placeholder="City, Country or permanent residential address"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                                {editId ? (
                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        onClick={() => {
                                            const g = guests.find(item => item.id === editId)
                                            closeModal()
                                            handleDelete(g || { id: editId, name: form.name, email: form.email })
                                        }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                                    >
                                        <Trash2 size={14} />
                                        Delete Guest (Free Rooms)
                                    </button>
                                ) : <div />}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? 'Saving...' : editId ? 'Update Guest' : 'Register Guest'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
