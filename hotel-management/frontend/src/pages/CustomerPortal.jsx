import { useEffect, useState } from 'react'
import { Plus, BookOpen, FileText, XCircle, Zap, ShieldCheck, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { getMyBookings, createBooking, updateBooking, getRooms, getInvoices, initializeChapaPayment } from '../services/api'
import { useAuth } from '../context/AuthContext'
import BookingDiningSelector from '../components/dining/BookingDiningSelector'

const statusBadge = { pending: 'badge-warning', confirmed: 'badge-info', checked_in: 'badge-success', checked_out: 'badge-gray', cancelled: 'badge-danger' }
const invoiceStatusBadge = { draft: 'badge-gray', sent: 'badge-info', paid: 'badge-success', overdue: 'badge-danger' }

export default function CustomerPortal() {
    const { user } = useAuth()
    const [tab, setTab] = useState('bookings')
    const [bookings, setBookings] = useState([])
    const [invoices, setInvoices] = useState([])
    const [rooms, setRooms] = useState([])
    const [loading, setLoading] = useState(true)
    const [payingBookingId, setPayingBookingId] = useState(null)
    const [modal, setModal] = useState(false)
    const [diningPreOrder, setDiningPreOrder] = useState({
        items: [],
        total: 0,
        deliveryTime: 'On arrival / Check-in',
        diningNotes: ''
    })
    const [form, setForm] = useState({
        room_id: '',
        check_in: '',
        check_out: '',
        adults: 1,
        children: 0,
        special_requests: '',
        name: '',
        phone: '',
        reason_for_stay: 'Tourism / Leisure',
        id_proof: 'National ID',
        id_number: ''
    })
    const [saving, setSaving] = useState(false)

    const openBookingModal = () => {
        setDiningPreOrder({
            items: [],
            total: 0,
            deliveryTime: 'On arrival / Check-in',
            diningNotes: ''
        })
        setForm({
            room_id: '',
            check_in: '',
            check_out: '',
            adults: 1,
            children: 0,
            special_requests: '',
            name: user?.name || '',
            phone: user?.phone || '',
            reason_for_stay: user?.reason_for_stay || 'Tourism / Leisure',
            id_proof: user?.id_proof || 'National ID',
            id_number: user?.id_number || ''
        })
        setModal(true)
    }

    const handleChapaPay = async (bookingId, amount) => {
        setPayingBookingId(bookingId)
        const toastId = toast.loading('Initializing Chapa Payment Gateway...')
        try {
            const res = await initializeChapaPayment({ booking_id: Number(bookingId), amount: Number(amount) })
            toast.dismiss(toastId)
            if (res.data?.checkout_url) {
                window.location.href = res.data.checkout_url
            } else {
                toast.error('Unable to open Chapa checkout')
            }
        } catch (err) {
            toast.dismiss(toastId)
            toast.error(err.response?.data?.error || 'Payment initialization failed')
        } finally {
            setPayingBookingId(null)
        }
    }

    const load = () => {
        setLoading(true)
        Promise.all([getMyBookings(), getRooms('available'), getInvoices()])
            .then(([b, r, inv]) => {
                setBookings(b.data || [])
                setRooms(r.data || [])
                setInvoices(inv.data || [])
            })
            .catch(() => toast.error('Failed to load portal data'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.room_id) return toast.error('Please select an available room')
        if (form.check_in >= form.check_out) return toast.error('Check-out must be after check-in')
        if (!form.name?.trim()) return toast.error('Full name is required by hotel registration rules')
        if (!form.id_number?.trim()) return toast.error('ID number is required by hotel registration rules')

        setSaving(true)
        try {
            await createBooking({
                ...form,
                guest_id: user.id,
                status: 'pending',
                dining_items: diningPreOrder.items,
                dining_total: diningPreOrder.total,
                dining_delivery_time: diningPreOrder.deliveryTime,
                dining_notes: diningPreOrder.diningNotes
            })
            toast.success('Booking registered successfully under hotel registration rules!')
            setModal(false)
            load()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to submit booking')
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = async (booking) => {
        if (!confirm('Cancel this booking? This cannot be undone.')) return
        try {
            await updateBooking(booking.id, { status: 'cancelled', room_id: booking.room_id })
            toast.success('Booking cancelled')
            load()
        } catch {
            toast.error('Failed to cancel booking')
        }
    }

    const selectedRoom = rooms.find(r => r.id == form.room_id)
    const nights = form.check_in && form.check_out ? Math.max(0, (new Date(form.check_out) - new Date(form.check_in)) / 86400000) : 0
    const roomCost = selectedRoom ? nights * Number(selectedRoom.price_per_night) : 0
    const estimate = (roomCost + (diningPreOrder?.total || 0)).toFixed(2)

    const tabStyle = (active) => ({
        padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
        fontWeight: 600, fontSize: 14,
        background: active ? '#3b82f6' : '#f3f4f6',
        color: active ? '#fff' : '#6b7280'
    })

    return (
        <div>
            <div className="page-header">
                <div>
                    <h2>My Customer Portal</h2>
                    <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                        Welcome back, {user?.name}! Manage your room reservations, orders, and invoices.
                    </p>
                </div>
                <button className="btn btn-primary" onClick={openBookingModal}>
                    <Plus size={16} /> Book an Available Room
                </button>
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

            {loading ? (
                <div className="loading"><div className="spinner" />Loading your portal...</div>
            ) : (
                <>
                    {/* ── Bookings Tab ── */}
                    {tab === 'bookings' && (
                        bookings.length === 0 ? (
                            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                                <BookOpen size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} />
                                <h3 style={{ marginBottom: 8, color: '#374151' }}>No bookings yet</h3>
                                <p style={{ color: '#9ca3af', marginBottom: 20 }}>Explore our available rooms and register your stay!</p>
                                <button className="btn btn-primary" onClick={openBookingModal}>Book Now</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {bookings.map(b => (
                                    <div key={b.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                                <h4 style={{ margin: 0, fontSize: 16 }}>Booking #{b.id} — Room {b.room_number}</h4>
                                                <span className={`badge ${statusBadge[b.status]}`} style={{ textTransform: 'capitalize' }}>
                                                    {b.status?.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 13, color: '#6b7280', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                                <span>📅 {b.check_in} to {b.check_out}</span>
                                                <span>🛏️ {b.room_type}</span>
                                                <span>👥 {b.adults} Adults {b.children > 0 ? `, ${b.children} Children` : ''}</span>
                                                {b.reason_for_stay && (
                                                    <span style={{ background: '#eff6ff', color: '#1e40af', padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                                                        {b.reason_for_stay}
                                                    </span>
                                                )}
                                            </div>
                                            {b.special_requests && (
                                                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 6, fontStyle: 'italic' }}>
                                                    Special Requests: {b.special_requests}
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 18, fontWeight: 700, color: '#1d4ed8' }}>
                                                    ETB {Number(b.total_amount || 0).toFixed(2)}
                                                </div>
                                                <div style={{ fontSize: 12, color: '#6b7280' }}>
                                                    {Number(b.balance_amount || 0) <= 0 ? (
                                                        <span style={{ color: '#059669', fontWeight: 600 }}>✓ Settled</span>
                                                    ) : (
                                                        <span style={{ color: '#dc2626', fontWeight: 600 }}>Due: ETB {Number(b.balance_amount || 0).toFixed(2)}</span>
                                                    )}
                                                </div>
                                            </div>

                                            {['pending', 'confirmed'].includes(b.status) && (
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    {Number(b.balance_amount || b.total_amount) > 0 && (
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ background: '#059669', color: '#fff', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                            disabled={payingBookingId === b.id}
                                                            onClick={() => handleChapaPay(b.id, b.balance_amount || b.total_amount)}
                                                        >
                                                            <Zap size={13} /> {payingBookingId === b.id ? 'Loading...' : 'Pay with Chapa'}
                                                        </button>
                                                    )}
                                                    <button
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleCancel(b)}
                                                        style={{ fontSize: 12 }}
                                                    >
                                                        <XCircle size={13} /> Cancel
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
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoices.map(inv => (
                                                <tr key={inv.id}>
                                                    <td style={{ fontWeight: 600, color: '#1d4ed8' }}>{inv.invoice_number}</td>
                                                    <td>Room {inv.room_number}</td>
                                                    <td>{inv.check_in}</td>
                                                    <td>{inv.check_out}</td>
                                                    <td style={{ fontWeight: 600 }}>ETB {Number(inv.total || 0).toFixed(2)}</td>
                                                    <td>
                                                        <span className={`badge ${invoiceStatusBadge[inv.status] || 'badge-gray'}`} style={{ textTransform: 'capitalize' }}>
                                                            {inv.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontSize: 13, color: '#6b7280' }}>{inv.due_date || '-'}</td>
                                                    <td>
                                                        {inv.status !== 'paid' && (
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ background: '#059669', color: '#fff', fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                                disabled={payingBookingId === inv.booking_id}
                                                                onClick={() => handleChapaPay(inv.booking_id, inv.total)}
                                                            >
                                                                <Zap size={11} /> {payingBookingId === inv.booking_id ? 'Loading...' : 'Pay Chapa'}
                                                            </button>
                                                        )}
                                                    </td>
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

            {/* ── Book Room Modal (Based on Hotel Registration Rule) ── */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal" style={{ maxWidth: 560 }}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ShieldCheck color="#2563eb" size={20} /> Book an Available Room (Registration Rule)
                            </h3>
                            <button className="btn btn-icon btn-outline" onClick={() => setModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                {/* Room Selection */}
                                <div className="form-group">
                                    <label className="form-label">Available Room *</label>
                                    <select
                                        className="form-control"
                                        value={form.room_id}
                                        onChange={e => setForm({ ...form, room_id: e.target.value })}
                                        required
                                    >
                                        <option value="">-- Choose an Available Room --</option>
                                        {rooms.filter(r => r.status === 'available').map(r => (
                                            <option key={r.id} value={r.id}>
                                                Room {r.room_number} — {r.type} (Available) — ETB {Number(r.price_per_night).toFixed(2)}/night (Max {r.max_guests} guests)
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {selectedRoom && (
                                    <div style={{ background: '#eff6ff', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, border: '1px solid #bfdbfe' }}>
                                        <strong>Room {selectedRoom.room_number} ({selectedRoom.type})</strong>: {selectedRoom.description}
                                        <div style={{ color: '#1e40af', marginTop: 4 }}>Amenities: {selectedRoom.amenities}</div>
                                    </div>
                                )}

                                {/* Stay Dates */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Check In Date *</label>
                                        <input
                                            className="form-control"
                                            type="date"
                                            min={new Date().toISOString().split('T')[0]}
                                            value={form.check_in}
                                            onChange={e => setForm({ ...form, check_in: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Check Out Date *</label>
                                        <input
                                            className="form-control"
                                            type="date"
                                            min={form.check_in || new Date().toISOString().split('T')[0]}
                                            value={form.check_out}
                                            onChange={e => setForm({ ...form, check_out: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Adults</label>
                                        <input
                                            className="form-control"
                                            type="number"
                                            min={1}
                                            value={form.adults}
                                            onChange={e => setForm({ ...form, adults: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Children</label>
                                        <input
                                            className="form-control"
                                            type="number"
                                            min={0}
                                            value={form.children}
                                            onChange={e => setForm({ ...form, children: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Hotel Registration Rule Section */}
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, margin: '14px 0' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                        <UserCheck size={16} color="#2563eb" /> Hotel Guest Registration Format Rule
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Guest Full Name *</label>
                                            <input
                                                className="form-control"
                                                value={form.name}
                                                onChange={e => setForm({ ...form, name: e.target.value })}
                                                placeholder="Guest full name"
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Contact Phone *</label>
                                            <input
                                                className="form-control"
                                                value={form.phone}
                                                onChange={e => setForm({ ...form, phone: e.target.value })}
                                                placeholder="+251 91 123 4567"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
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
                                        <div className="form-group">
                                            <label className="form-label">ID Proof Type *</label>
                                            <select
                                                className="form-control"
                                                value={form.id_proof}
                                                onChange={e => setForm({ ...form, id_proof: e.target.value })}
                                                required
                                            >
                                                <option value="National ID">National ID / Kebele</option>
                                                <option value="Passport">Passport</option>
                                                <option value="Driver License">Driver's License</option>
                                                <option value="Residence Permit">Residence Permit</option>
                                                <option value="Other">Other ID</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">ID / Passport Number *</label>
                                        <input
                                            className="form-control"
                                            value={form.id_number}
                                            onChange={e => setForm({ ...form, id_number: e.target.value })}
                                            placeholder="e.g. EP-998877 or Kebele ID #"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Dining & Bar Selection & Recommendations Component */}
                                <BookingDiningSelector
                                    selectedItems={diningPreOrder.items}
                                    onItemsChange={setDiningPreOrder}
                                    roomNumber={selectedRoom?.room_number || ''}
                                    currency="ETB"
                                />

                                {nights > 0 && selectedRoom && (
                                    <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 13, border: '1px solid #bbf7d0', color: '#166534', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>🛏️ <strong>Room {selectedRoom.room_number}</strong> ({nights} night{nights > 1 ? 's' : ''})</span>
                                            <span>ETB {roomCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        {diningPreOrder.total > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#059669', fontWeight: 600 }}>
                                                <span>🍽️ Pre-ordered Dining & Bar ({diningPreOrder.items.length} items)</span>
                                                <span>+ETB {diningPreOrder.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #bbf7d0', paddingTop: 6, fontWeight: 700, fontSize: 15 }}>
                                            <span>Total Value Due:</span>
                                            <span style={{ color: '#15803d' }}>ETB {Number(estimate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Special Requests (optional)</label>
                                    <textarea
                                        className="form-control"
                                        rows={2}
                                        placeholder="Airport pickup, high floor, extra pillows..."
                                        value={form.special_requests}
                                        onChange={e => setForm({ ...form, special_requests: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Registering Booking...' : 'Submit & Register Booking'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
