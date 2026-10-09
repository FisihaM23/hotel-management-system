import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { getGuests, createGuest, updateGuest, deleteGuest } from '../services/api'

const emptyForm = { name: '', email: '', phone: '', address: '', id_proof: '' }

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
        getGuests(q).then(res => setGuests(res.data)).catch(() => toast.error('Failed to load guests')).finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const handleSearch = (e) => {
        const val = e.target.value
        setSearch(val)
        if (val.length === 0 || val.length >= 2) load(val)
    }

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal(true) }
    const openEdit = (g) => { setForm(g); setEditId(g.id); setModal(true) }
    const closeModal = () => { setModal(false); setForm(emptyForm); setEditId(null) }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            if (editId) {
                await updateGuest(editId, form)
                toast.success('Guest updated')
            } else {
                await createGuest(form)
                toast.success('Guest added')
            }
            closeModal()
            load(search)
        } catch (err) {
            toast.error(err.response?.data?.error || 'Operation failed')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this guest?')) return
        try {
            await deleteGuest(id)
            toast.success('Guest deleted')
            load(search)
        } catch {
            toast.error('Failed to delete guest')
        }
    }

    return (
        <div>
            <div className="page-header">
                <h2>Guests</h2>
                <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Guest</button>
            </div>

            <div className="search-bar">
                <div className="search-input-wrap">
                    <Search />
                    <input placeholder="Search by name, email or phone..." value={search} onChange={handleSearch} />
                </div>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{guests.length} guests</span>
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
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>ID Proof</th>
                                    <th>Registered</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {guests.length === 0 ? (
                                    <tr><td colSpan={7}>
                                        <div className="empty-state">
                                            <Users size={40} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
                                            <p>No guests found</p>
                                        </div>
                                    </td></tr>
                                ) : guests.map(g => (
                                    <tr key={g.id}>
                                        <td>{g.id}</td>
                                        <td style={{ fontWeight: 500 }}>{g.name}</td>
                                        <td>{g.email}</td>
                                        <td>{g.phone || '-'}</td>
                                        <td>{g.id_proof || '-'}</td>
                                        <td>{new Date(g.created_at).toLocaleDateString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(g)} title="Edit"><Pencil size={13} /></button>
                                                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(g.id)} title="Delete"><Trash2 size={13} /></button>
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
                            <h3>{editId ? 'Edit Guest' : 'Add Guest'}</h3>
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
                                        <label className="form-label">Phone</label>
                                        <input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">ID Proof</label>
                                        <input className="form-control" placeholder="Passport / License No." value={form.id_proof} onChange={e => setForm({ ...form, id_proof: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Address</label>
                                    <textarea className="form-control" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Add Guest'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
