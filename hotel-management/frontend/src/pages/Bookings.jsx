import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { getBookings, createBooking, updateBooking, deleteBooking, getRooms, getGuests } from '../services/api'

const statusBadge = { pending: 'badge-warning', confirmed: 'badge-info', checked_in: 'badge-success', checked_out: 'badge-gray', cancelled: 'badge-danger' }
const emptyForm = { guest_id: '', room_id: '', check_in: '', check_out: '', adults: 1, children: 0, special_requests: '', status: 'pending' }

export default function Bookings() {
    const [bookings, setBookings] = useState([])
    const [rooms, setRooms] = useState([])
    const [guests, setGuests] = useState([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editId, setEditId] = useState(null)
    const [filter, setFilter] = useState('')
    const [search, setSearch] = useState('')
    const [saving, setSaving] = useState(false)

    const load = () => {
        setLoading(true)
        Promise.all([getBookings(), getRooms(), getGuests()])
            .then(([b, r, g]) => { setBookings(b.data); setRooms(r.data); setGuests(g.data) })
            .catch(() => toast.error('Failed to load data'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal(true) }
    const openEdit = (b) => {
        setForm({ guest_id: b.customer_id, room_id: b.room_id, check_in: b.check_in, check_out: b.check_out, adults: b.adults, children: b.children, special_requests: b.special_requests || '', status: b.status })
        setEditId(b.id); setModal(true)
    }
    const closeModal = () => { setModal(false); setForm(emptyForm); setEditId(null) }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.guest_id || !form.room_id) return toast.error('Select guest and room')
        if (form.check_in >= form.check_out) return toast.error('Check-out must be after check-in')
        setSaving(true)
        try {
            editId ? await updateBooking(editId, form) : await createBooking(form)
            toast.success(editId ? 'Booking updated' : 'Booking created')
            closeModal(); load()
        } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
        finally { setSaving(false) }
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this booking?')) return
        try { await deleteBooking(id); toast.success('Deleted'); load() }
        catch { toast.error('Failed to delete') }
    }

    const handleStatusChange = async (id, status, roomId) => {
        try { await updateBooking(id, { status, room_id: roomId }); toast.success('Status updated'); load() }
        catch { toast.error('Failed') }
    }

    const filtered = bookings.filter(b => {
        const matchStatus = !filter || b.status === filter
        const matchSearch = !search || b.guest_name?.toLowerCase().includes(search.toLowerCase()) || b.room_number?.includes(search)
        return matchStatus && matchSearch
    })

    return (
        <div>
            <div className="page-header">
                <h2>Bookings</h2>
                <button className="btn btn-primary" onClick={openAdd}><Plus size={16} />New Booking</button>
            </div>

            <div className="search-bar">
                <div className="search-input-wrap">
                    <Search />
                    <input placeholder="Search guest or room..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select className="form-control" style={{ width: 160 }} value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="">All Status</option>
                    {['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'].map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s.replace('_', ' ')}</option>)}
                </select>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{filtered.length} bookings</span>
            </div>

            <div className="card">
                {loading ? <div className="loading"><div className="spinner" />Loading...</div> : (
                    <div className="table-container">
                        <table>
                            <thead><tr><th>#</th><th>Guest</th><th>Room</th><th>Check In</th><th>Check Out</th><th>Guests</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {filtered.length === 0
                                    ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No bookings found</td></tr>
                                    : filtered.map(b => (
                                        <tr key={b.id}>
                                            <td>#{b.id}</td>
                                            <td><div style={{ fontWeight: 500 }}>{b.guest_name}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>{b.guest_email}</div></td>
                                            <td><div>Room {b.room_number}</div><div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'capitalize' }}>{b.room_type}</div></td>
                                            <td>{b.check_in}</td><td>{b.check_out}</td>
                                            <td>{b.adults}A {b.children > 0 ? `${b.children}C` : ''}</td>
                                            <td>${Number(b.total_amount || 0).toFixed(2)}</td>
                                            <td>
                                                <select value={b.status} onChange={e => handleStatusChange(b.id, e.target.value, b.room_id)}
                                                    className={`badge ${statusBadge[b.status]}`} style={{ border: 'none', cursor: 'pointer', textTransform: 'capitalize', background: 'transparent' }}>
                                                    {['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                                </select>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(b)}><Pencil size={13} /></button>
                                                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(b.id)}><Trash2 size={13} /></button>
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
                            <h3>{editId ? 'Edit Booking' : 'New Booking'}</h3>
                            <button className="btn btn-icon btn-outline" onClick={closeModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Guest *</label>
                                        <select className="form-control" value={form.guest_id} onChange={e => setForm({ ...form, guest_id: e.target.value })} required>
                                            <option value="">Select guest</option>
                                            {guests.map(g => <option key={g.id} value={g.id}>{g.name} ({g.email})</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Room *</label>
                                        <select className="form-control" value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })} required>
                                            <option value="">Select room</option>
                                            {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number} - {r.type} ({r.status}) (${r.price_per_night}/night)</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Check In *</label>
                                        <input className="form-control" type="date" value={form.check_in} onChange={e => setForm({ ...form, check_in: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Check Out *</label>
                                        <input className="form-control" type="date" value={form.check_out} onChange={e => setForm({ ...form, check_out: e.target.value })} required />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Adults</label>
                                        <input className="form-control" type="number" min={1} value={form.adults} onChange={e => setForm({ ...form, adults: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Children</label>
                                        <input className="form-control" type="number" min={0} value={form.children} onChange={e => setForm({ ...form, children: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Status</label>
                                    <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                        {['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'].map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s.replace('_', ' ')}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Special Requests</label>
                                    <textarea className="form-control" rows={2} value={form.special_requests} onChange={e => setForm({ ...form, special_requests: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Create Booking'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
