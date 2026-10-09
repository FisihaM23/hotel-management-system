import { useEffect, useState } from 'react'
import { Plus, BookOpen, FileText, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { getMyBookings, createBooking, updateBooking, getRooms, getInvoices } from '../services/api'
import { useAuth } from '../context/AuthContext'

const statusBadge = { pending: 'badge-warning', confirmed: 'badge-info', checked_in: 'badge-success', checked_out: 'badge-gray', cancelled: 'badge-danger' }
const invoiceStatusBadge = { draft: 'badge-gray', sent: 'badge-info', paid: 'badge-success', overdue: 'badge-danger' }
const emptyForm = { room_id: '', check_in: '', check_out: '', adults: 1, children: 0, special_requests: '' }

export default function CustomerPortal() {
    const [tab, setTab] = useState('bookings')
    const [bookings, setBookings] = useState([])
    const [invoices, setInvoices] = useState([])
    const [rooms, setRooms] = useState([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const { user } = useAuth()

    const load = () => {
        setLoading(true)
        Promise.all([getMyBookings(), getRooms('available'), getInvoices()])
            .then(([b, r, inv]) => {
                setBookings(b.data)
                setRooms(r.data)
                setInvoices(inv.data)
            })
            .catch(() => toast.error('Failed to load'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (form.check_in >= form.check_out) return toast.error('Check-out must be after check-in')
        setSaving(true)
        try {
            await createBooking({ ...form, guest_id: user.id, status: 'pending' })
            toast.success('Booking request submitted! We will confirm shortly.')
            setModal(false); setForm(emptyForm); load()
        } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
        finally { setSaving(false) }
    }

    const handleCancel = async (booking) => {
        if (!confirm('Cancel this booking? This cannot be undone.')) return
        try {
            await updateBooking(booking.id, { status: 'cancelled', room_id: booking.room_id })
            toast.success('Booking cancelled')
            load()
        } catch { toast.error('Failed to cancel booking') }
    }

    const selectedRoom = rooms.find(r => r.id == form.room_id)
    const nights = form.check_in && form.check_out ? Math.max(0, (new Date(form.check_out) - new Date(form.check_in)) / 86400000) : 0
    const estimate = selectedRoom ? (nights * selectedRoom.price_per_night).toFixed(2) : 0

    const tabStyle = (active) => ({
        padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
        fontWeight: 600, fontSize: 14,
        background: active ? '#3b82f6' : '#f3f4f6',
        color: active ? '#fff' : '#6b7280'
    })

    return (
        <div>
            <div className="page-header">
                <h2>My Portal</h2>
                <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={16} />Book a Room</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <button style={tabStyle(tab === 'bookings')} onClick={() => setTab('bookings')}>
                    <BookOpen size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />My Bookings
                </button>
                <button style={tabStyle(tab === 'invoices')} onClick={() => setTab('invoices')}>
                    <FileText size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />My Invoices
                </button>
            </div>

            {loading ? <div className="loading"><div className="spinner" />Loading...</div> : (
                <>
                    {/* ── Bookings Tab ── */}
                    {tab === 'bookings' && (
                        bookings.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                                <BookOpen size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} />
                                <h3 style={{ marginBottom: 8, color: '#374151' }}>No bookings yet</h3>
                                <p style={{ color: '#9ca3af', marginBottom: 20 }}>Book your first room to get started</p>
                                <button className="btn btn-primary" onClick={() => setModal(true)}>Book a Room</button>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: 16 }}>
                                {bookings.map(b => (
                                    <div key={b.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 16 }}>Room {b.room_number} — {b.room_type}</div>
                                            <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                                                Check in: {b.check_in} &nbsp;→&nbsp; Check out: {b.check_out}
                                            </div>
                                            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                                                {b.adults} adult{b.adults > 1 ? 's' : ''}{b.children > 0 ? `, ${b.children} child${b.children > 1 ? 'ren' : ''}` : ''}
                                            </div>
                                            {b.special_requests && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Note: {b.special_requests}</div>}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: '#1d4ed8' }}>${Number(b.total_amount || 0).toFixed(2)}</div>
                                            <span className={`badge ${statusBadge[b.status]}`} style={{ textTransform: 'capitalize', marginTop: 6, display: 'inline-block' }}>
                                                {b.status?.replace('_', ' ')}
                                            </span>
                                            {['pending', 'confirmed'].includes(b.status) && (
                                                <div style={{ marginTop: 8 }}>
                                                    <button
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleCancel(b)}
                                                        style={{ fontSize: 12 }}
                                                    >
                                                        <XCircle size={13} />Cancel
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {/* ── Invoices Tab ── */}
                    {tab === 'invoices' && (
                        invoices.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                                <FileText size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} />
                                <h3 style={{ marginBottom: 8, color: '#374151' }}>No invoices yet</h3>
                                <p style={{ color: '#9ca3af' }}>Invoices will appear here after your stay is confirmed.</p>
                            </div>
                        ) : (
                            <div className="card">
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Invoice #</th>
                                                <th>Room</th>
                                                <th>Check In</th>
                                                <th>Check Out</th>
                                                <th>Total</th>
                                                <th>Status</th>
                                                <th>Due Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoices.map(inv => (
                                                <tr key={inv.id}>
                                                    <td style={{ fontWeight: 600, color: '#1d4ed8' }}>{inv.invoice_number}</td>
                                                    <td>Room {inv.room_number}</td>
                                                    <td>{inv.check_in}</td>
                                                    <td>{inv.check_out}</td>
                                                    <td style={{ fontWeight: 600 }}>${Number(inv.total || 0).toFixed(2)}</td>
                                                    <td>
                                                        <span className={`badge ${invoiceStatusBadge[inv.status] || 'badge-gray'}`} style={{ textTransform: 'capitalize' }}>
                                                            {inv.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontSize: 13, color: '#6b7280' }}>{inv.due_date || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )
                    )}
                </>
            )}

            {/* ── Book Room Modal ── */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3>Book a Room</h3>
                            <button className="btn btn-icon btn-outline" onClick={() => setModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Select Room *</label>
                                    <select className="form-control" value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })} required>
                                        <option value="">Choose a room</option>
                                        {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number} — {r.type} — ${r.price_per_night}/night (max {r.max_guests} guests)</option>)}
                                    </select>
                                </div>
                                {selectedRoom && (
                                    <div style={{ background: '#eff6ff', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                                        <strong>{selectedRoom.description}</strong>
                                        <div style={{ color: '#6b7280', marginTop: 4 }}>Amenities: {selectedRoom.amenities}</div>
                                    </div>
                                )}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Check In *</label>
                                        <input className="form-control" type="date" min={new Date().toISOString().split('T')[0]} value={form.check_in} onChange={e => setForm({ ...form, check_in: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Check Out *</label>
                                        <input className="form-control" type="date" min={form.check_in || new Date().toISOString().split('T')[0]} value={form.check_out} onChange={e => setForm({ ...form, check_out: e.target.value })} required />
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
                                {nights > 0 && selectedRoom && (
                                    <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 14 }}>
                                        {nights} night(s) × ${selectedRoom.price_per_night} = <strong>${estimate}</strong>
                                    </div>
                                )}
                                <div className="form-group">
                                    <label className="form-label">Special Requests</label>
                                    <textarea className="form-control" rows={2} placeholder="Any special requirements..." value={form.special_requests} onChange={e => setForm({ ...form, special_requests: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Submitting...' : 'Submit Booking'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
