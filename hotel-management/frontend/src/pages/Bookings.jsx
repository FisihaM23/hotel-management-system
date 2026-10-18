import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Search, UserPlus, LogIn, LogOut, CheckCircle2, AlertCircle, CreditCard, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import {
    getBookings,
    createBooking,
    updateBooking,
    deleteBooking,
    getRooms,
    getGuests,
    createGuest,
    checkInBooking,
    checkOutBooking,
    PAYMENT_METHODS
} from '../services/api'
import BookingDiningSelector from '../components/dining/BookingDiningSelector'

const statusBadge = {
    pending: 'badge-warning',
    confirmed: 'badge-info',
    checked_in: 'badge-success',
    checked_out: 'badge-gray',
    cancelled: 'badge-danger'
}

const emptyForm = {
    guest_id: '',
    room_id: '',
    check_in: '',
    check_out: '',
    adults: 1,
    children: 0,
    special_requests: '',
    status: 'pending'
}

const emptyGuest = {
    name: '',
    email: '',
    phone: '',
    reason_for_stay: 'Tourism / Leisure',
    id_proof: 'National ID',
    id_number: '',
    address: ''
}

export default function Bookings() {
    const [bookings, setBookings] = useState([])
    const [rooms, setRooms] = useState([])
    const [guests, setGuests] = useState([])
    const [loading, setLoading] = useState(true)

    // Regular Booking Modal
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editId, setEditId] = useState(null)
    const [saving, setSaving] = useState(false)
    const [guestMode, setGuestMode] = useState('existing') // 'existing' | 'new_walk_in'
    const [walkInForm, setWalkInForm] = useState(emptyGuest)
    const [onlyAvailableRooms, setOnlyAvailableRooms] = useState(true)
    const [diningPreOrder, setDiningPreOrder] = useState({
        items: [],
        total: 0,
        deliveryTime: 'On arrival / Check-in',
        diningNotes: ''
    })

    // Quick Guest Modal
    const [quickGuestModal, setQuickGuestModal] = useState(false)
    const [quickGuestForm, setQuickGuestForm] = useState(emptyGuest)
    const [savingQuickGuest, setSavingQuickGuest] = useState(false)

    // Check-In Modal
    const [checkInModal, setCheckInModal] = useState(false)
    const [checkInBookingData, setCheckInBookingData] = useState(null)
    const [checkInForm, setCheckInForm] = useState({
        collect_payment: true,
        payment_amount: '',
        payment_method: 'telebirr',
        transaction_id: '',
        notes: 'Check-in deposit / payment'
    })
    const [checkingIn, setCheckingIn] = useState(false)

    // Check-Out Modal
    const [checkOutModal, setCheckOutModal] = useState(false)
    const [checkOutBookingData, setCheckOutBookingData] = useState(null)
    const [checkOutForm, setCheckOutForm] = useState({
        collect_payment: true,
        payment_amount: '',
        payment_method: 'cbe_birr',
        transaction_id: '',
        notes: 'Final settlement at check-out'
    })
    const [checkingOut, setCheckingOut] = useState(false)

    // Filters
    const [filter, setFilter] = useState('')
    const [search, setSearch] = useState('')

    const load = () => {
        setLoading(true)
        Promise.all([getBookings(), getRooms(), getGuests()])
            .then(([b, r, g]) => {
                setBookings(b.data || [])
                setRooms(r.data || [])
                setGuests(g.data || [])
            })
            .catch(() => toast.error('Failed to load bookings'))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load()
    }, [])

    const openAdd = () => {
        const today = new Date().toISOString().split('T')[0]
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
        setForm({
            ...emptyForm,
            check_in: today,
            check_out: tomorrow
        })
        setGuestMode('existing')
        setWalkInForm(emptyGuest)
        setOnlyAvailableRooms(true)
        setDiningPreOrder({ items: [], total: 0, deliveryTime: 'On arrival / Check-in', diningNotes: '' })
        setEditId(null)
        setModal(true)
    }

    const openEdit = (b) => {
        setForm({
            guest_id: b.customer_id,
            room_id: b.room_id,
            check_in: b.check_in,
            check_out: b.check_out,
            adults: b.adults,
            children: b.children,
            special_requests: b.special_requests || '',
            status: b.status
        })
        setGuestMode('existing')
        setOnlyAvailableRooms(false)
        setDiningPreOrder({ items: [], total: 0, deliveryTime: 'On arrival / Check-in', diningNotes: '' })
        setEditId(b.id)
        setModal(true)
    }

    const closeModal = () => {
        setModal(false)
        setForm(emptyForm)
        setEditId(null)
        setGuestMode('existing')
        setWalkInForm(emptyGuest)
        setDiningPreOrder({ items: [], total: 0, deliveryTime: 'On arrival / Check-in', diningNotes: '' })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.room_id) return toast.error('Please select an available room')
        if (!form.check_in || !form.check_out) return toast.error('Check-in and check-out dates are required')
        if (form.check_in >= form.check_out) return toast.error('Check-out must be after check-in')

        let payload = {
            ...form,
            dining_items: diningPreOrder.items,
            dining_total: diningPreOrder.total,
            dining_delivery_time: diningPreOrder.deliveryTime,
            dining_notes: diningPreOrder.diningNotes
        }

        if (!editId) {
            if (guestMode === 'new_walk_in') {
                if (!walkInForm.name?.trim()) return toast.error('Guest Full Name is required based on hotel registration rules')
                if (!walkInForm.phone?.trim()) return toast.error('Contact Phone is required based on hotel registration rules')
                if (!walkInForm.reason_for_stay) return toast.error('Reason / Purpose of stay is required based on hotel registration rules')
                if (!walkInForm.id_proof) return toast.error('ID Proof type is required based on hotel registration rules')
                if (!walkInForm.id_number?.trim()) return toast.error('ID / Passport Number is required based on hotel registration rules')

                payload = {
                    ...payload,
                    customer_id: 0,
                    guest_id: 0,
                    name: walkInForm.name.trim(),
                    email: walkInForm.email?.trim() || '',
                    phone: walkInForm.phone.trim(),
                    reason_for_stay: walkInForm.reason_for_stay,
                    id_proof: walkInForm.id_proof,
                    id_number: walkInForm.id_number.trim(),
                    address: walkInForm.address?.trim() || ''
                }
            } else {
                if (!form.guest_id) return toast.error('Please select an existing registered guest or switch to New Walk-in Guest')
            }
        } else {
            if (!form.guest_id) return toast.error('Please select a guest')
        }

        setSaving(true)
        try {
            if (editId) {
                await updateBooking(editId, payload)
                toast.success('Booking updated')
            } else {
                await createBooking(payload)
                toast.success('Booking registered successfully under hotel registration rules!')
            }
            closeModal()
            load()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save booking')
        } finally {
            setSaving(false)
        }
    }

    const handleQuickGuestSubmit = async (e) => {
        e.preventDefault()
        setSavingQuickGuest(true)
        try {
            const res = await createGuest(quickGuestForm)
            toast.success('Guest registered successfully!')
            const newGuestId = res.data?.id
            const gRes = await getGuests()
            setGuests(gRes.data || [])
            if (newGuestId) {
                setForm(prev => ({ ...prev, guest_id: newGuestId }))
            }
            setQuickGuestModal(false)
            setQuickGuestForm(emptyGuest)
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to register guest')
        } finally {
            setSavingQuickGuest(false)
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this booking?')) return
        try {
            await deleteBooking(id)
            toast.success('Booking deleted')
            load()
        } catch {
            toast.error('Failed to delete booking')
        }
    }

    // Check-in modal opener
    const openCheckIn = (b) => {
        setCheckInBookingData(b)
        const balance = b.balance_amount !== undefined ? Number(b.balance_amount) : Number(b.total_amount || 0)
        setCheckInForm({
            collect_payment: balance > 0,
            payment_amount: balance > 0 ? balance : '',
            payment_method: 'telebirr',
            transaction_id: '',
            notes: 'Advance deposit at check-in'
        })
        setCheckInModal(true)
    }

    const handleCheckInSubmit = async (e) => {
        e.preventDefault()
        if (!checkInBookingData) return
        setCheckingIn(true)
        try {
            const payload = {
                action: 'check_in',
                status: 'checked_in',
                payment_amount: checkInForm.collect_payment ? Number(checkInForm.payment_amount || 0) : 0,
                payment_method: checkInForm.payment_method,
                transaction_id: checkInForm.transaction_id,
                notes: checkInForm.notes
            }
            await checkInBooking(checkInBookingData.id, payload)
            toast.success(`Guest checked in to Room ${checkInBookingData.room_number}! Room marked as Occupied.`)
            setCheckInModal(false)
            load()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to check in guest')
        } finally {
            setCheckingIn(false)
        }
    }

    // Check-out modal opener
    const openCheckOut = (b) => {
        setCheckOutBookingData(b)
        const balance = b.balance_amount !== undefined ? Number(b.balance_amount) : 0
        setCheckOutForm({
            collect_payment: balance > 0,
            payment_amount: balance > 0 ? balance : 0,
            payment_method: 'cbe_birr',
            transaction_id: '',
            notes: 'Check-out settlement payment'
        })
        setCheckOutModal(true)
    }

    const handleCheckOutSubmit = async (e) => {
        e.preventDefault()
        if (!checkOutBookingData) return
        setCheckingOut(true)
        try {
            const payload = {
                action: 'check_out',
                status: 'checked_out',
                payment_amount: (checkOutForm.collect_payment && Number(checkOutForm.payment_amount) > 0) ? Number(checkOutForm.payment_amount) : 0,
                payment_method: checkOutForm.payment_method,
                transaction_id: checkOutForm.transaction_id,
                notes: checkOutForm.notes
            }
            await checkOutBooking(checkOutBookingData.id, payload)
            toast.success(`Guest checked out of Room ${checkOutBookingData.room_number}! Room marked for Cleaning.`)
            setCheckOutModal(false)
            load()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to check out guest')
        } finally {
            setCheckingOut(false)
        }
    }

    const handleStatusSelect = (b, newStatus) => {
        if (newStatus === 'checked_in') {
            openCheckIn(b)
        } else if (newStatus === 'checked_out') {
            openCheckOut(b)
        } else {
            handleStatusChange(b.id, newStatus, b.room_id)
        }
    }

    const handleStatusChange = async (id, status, roomId) => {
        try {
            await updateBooking(id, { status, room_id: roomId })
            toast.success('Booking status updated')
            load()
        } catch {
            toast.error('Failed to update status')
        }
    }

    const filtered = bookings.filter(b => {
        const matchStatus = !filter || b.status === filter
        const matchSearch = !search ||
            b.guest_name?.toLowerCase().includes(search.toLowerCase()) ||
            b.room_number?.includes(search) ||
            b.id_number?.toLowerCase().includes(search.toLowerCase()) ||
            b.reason_for_stay?.toLowerCase().includes(search.toLowerCase())
        return matchStatus && matchSearch
    })

    const modalSelectedRoom = rooms.find(r => String(r.id) === String(form.room_id))
    const modalNights = form.check_in && form.check_out && form.check_out > form.check_in
        ? Math.max(1, Math.round((new Date(form.check_out) - new Date(form.check_in)) / 86400000))
        : 0
    const modalRoomCost = modalSelectedRoom && modalNights > 0
        ? modalNights * Number(modalSelectedRoom.price_per_night)
        : 0
    const modalEstimate = (modalRoomCost + (diningPreOrder?.total || 0)).toFixed(2)
    const availableRoomsCount = rooms.filter(r => r.status === 'available').length

    return (
        <div>
            <div className="page-header">
                <h2>Bookings & Front Desk</h2>
                <button className="btn btn-primary" onClick={openAdd}>
                    <Plus size={16} /> New Booking
                </button>
            </div>

            <div className="search-bar">
                <div className="search-input-wrap">
                    <Search />
                    <input
                        placeholder="Search guest name, room, ID number, or reason..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select className="form-control" style={{ width: 170 }} value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    {['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'].map(s => (
                        <option key={s} value={s} style={{ textTransform: 'capitalize' }}>
                            {s.replace('_', ' ')}
                        </option>
                    ))}
                </select>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{filtered.length} bookings</span>
            </div>

            <div className="card">
                {loading ? (
                    <div className="loading"><div className="spinner" />Loading bookings...</div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Guest & Reason</th>
                                    <th>ID Proof</th>
                                    <th>Room</th>
                                    <th>Stay Dates</th>
                                    <th>Financials</th>
                                    <th>Status</th>
                                    <th>Front Desk</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                                            No bookings found
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map(b => {
                                        const balance = Number(b.balance_amount || 0)
                                        const isPaid = balance <= 0
                                        return (
                                            <tr key={b.id}>
                                                <td>#{b.id}</td>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{b.guest_name}</div>
                                                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                                                        <span style={{ fontSize: 11, background: '#eff6ff', color: '#1e40af', padding: '1px 6px', borderRadius: 4 }}>
                                                            {b.reason_for_stay || 'Guest'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontSize: 12, fontWeight: 500 }}>{b.id_proof || 'National ID'}</div>
                                                    <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                                                        {b.id_number || 'N/A'}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 500 }}>Room {b.room_number}</div>
                                                    <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>
                                                        {b.room_type}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontSize: 12 }}>{b.check_in}</div>
                                                    <div style={{ fontSize: 11, color: '#9ca3af' }}>to {b.check_out}</div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>ETB {Number(b.total_amount || 0).toFixed(2)}</div>
                                                    <div style={{ fontSize: 11 }}>
                                                        {isPaid ? (
                                                            <span style={{ color: '#059669', fontWeight: 600 }}>✓ Settled</span>
                                                        ) : (
                                                            <span style={{ color: '#dc2626', fontWeight: 600 }}>Due: ETB {balance.toFixed(2)}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <select
                                                        value={b.status}
                                                        onChange={e => handleStatusSelect(b, e.target.value)}
                                                        className={`badge ${statusBadge[b.status]}`}
                                                        style={{ border: 'none', cursor: 'pointer', textTransform: 'capitalize', background: 'transparent', fontWeight: 600 }}
                                                    >
                                                        {['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'].map(s => (
                                                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    {/* Quick Front Desk Check-in / Check-out button */}
                                                    {(b.status === 'pending' || b.status === 'confirmed') && (
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ background: '#059669', color: '#fff', fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 6 }}
                                                            onClick={() => openCheckIn(b)}
                                                            title="Process Guest Check-In & Payment"
                                                        >
                                                            <LogIn size={13} /> Check In
                                                        </button>
                                                    )}
                                                    {b.status === 'checked_in' && (
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ background: '#2563eb', color: '#fff', fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 6 }}
                                                            onClick={() => openCheckOut(b)}
                                                            title="Process Guest Check-Out & Balance Settlement"
                                                        >
                                                            <LogOut size={13} /> Check Out
                                                        </button>
                                                    )}
                                                    {b.status === 'checked_out' && (
                                                        <span style={{ fontSize: 11, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                                                            <CheckCircle2 size={13} /> Completed
                                                        </span>
                                                    )}
                                                    {b.status === 'cancelled' && (
                                                        <span style={{ fontSize: 11, color: '#9ca3af' }}>Cancelled</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(b)} title="Edit Booking">
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(b.id)} title="Delete Booking">
                                                            <Trash2 size={13} />
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

            {/* Standard New/Edit Booking Modal */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
                    <div className="modal" style={{ maxWidth: (!editId && guestMode === 'new_walk_in') ? 640 : 540 }}>
                        <div className="modal-header">
                            <div>
                                <h3 style={{ margin: 0 }}>{editId ? 'Edit Booking' : 'New Room Booking'}</h3>
                                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                                    {editId ? `Editing reservation #${editId}` : 'Register a guest and reserve an available room'}
                                </p>
                            </div>
                            <button className="btn btn-icon btn-outline" onClick={closeModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                {/* Mode Selector (Only on New Booking) */}
                                {!editId && (
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
                                            <button
                                                type="button"
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: 6,
                                                    border: 'none',
                                                    background: guestMode === 'existing' ? '#fff' : 'transparent',
                                                    color: guestMode === 'existing' ? '#1d4ed8' : '#64748b',
                                                    fontWeight: 600,
                                                    fontSize: 13,
                                                    boxShadow: guestMode === 'existing' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6
                                                }}
                                                onClick={() => setGuestMode('existing')}
                                            >
                                                <span>👤 Existing Guest</span>
                                            </button>
                                            <button
                                                type="button"
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: 6,
                                                    border: 'none',
                                                    background: guestMode === 'new_walk_in' ? '#fff' : 'transparent',
                                                    color: guestMode === 'new_walk_in' ? '#1d4ed8' : '#64748b',
                                                    fontWeight: 600,
                                                    fontSize: 13,
                                                    boxShadow: guestMode === 'new_walk_in' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6
                                                }}
                                                onClick={() => setGuestMode('new_walk_in')}
                                            >
                                                <ShieldCheck size={14} color="#2563eb" />
                                                <span>📝 New Walk-In Guest</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Existing Guest Selection */}
                                {(editId || guestMode === 'existing') && (
                                    <div className="form-group">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <label className="form-label" style={{ margin: 0 }}>Select Registered Guest *</label>
                                            {!editId && (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm"
                                                    style={{ fontSize: 11, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 4 }}
                                                    onClick={() => {
                                                        setQuickGuestForm(emptyGuest)
                                                        setQuickGuestModal(true)
                                                    }}
                                                >
                                                    <UserPlus size={12} /> + Register New Guest
                                                </button>
                                            )}
                                        </div>
                                        <select className="form-control" value={form.guest_id} onChange={e => setForm({ ...form, guest_id: e.target.value })} required={guestMode === 'existing'}>
                                            <option value="">-- Choose Registered Guest --</option>
                                            {guests.map(g => (
                                                <option key={g.id} value={g.id}>
                                                    #{g.id} - {g.name} [{g.reason_for_stay || 'Guest'}] ({g.id_proof ? `${g.id_proof}: ${g.id_number || 'N/A'}` : g.phone || g.email})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Walk-In Guest Inline Registration (Hotel Format Rule) */}
                                {!editId && guestMode === 'new_walk_in' && (
                                    <div style={{ background: '#f8fafc', border: '1px solid #93c5fd', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1e40af', fontWeight: 700, fontSize: 13 }}>
                                                <ShieldCheck size={16} color="#2563eb" /> Hotel Guest Registration Format Rule (Mandatory)
                                            </div>
                                            <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                                                Walk-In Auto-Register
                                            </span>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="form-label">Guest Full Name *</label>
                                                <input
                                                    className="form-control"
                                                    placeholder="Full name (e.g. Abebe Bikila)"
                                                    value={walkInForm.name}
                                                    onChange={e => setWalkInForm({ ...walkInForm, name: e.target.value })}
                                                    required={guestMode === 'new_walk_in'}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Contact Phone *</label>
                                                <input
                                                    className="form-control"
                                                    placeholder="+251 91 123 4567"
                                                    value={walkInForm.phone}
                                                    onChange={e => setWalkInForm({ ...walkInForm, phone: e.target.value })}
                                                    required={guestMode === 'new_walk_in'}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="form-label">Email Address (Optional)</label>
                                                <input
                                                    type="email"
                                                    className="form-control"
                                                    placeholder="guest@example.com (or auto-generated)"
                                                    value={walkInForm.email}
                                                    onChange={e => setWalkInForm({ ...walkInForm, email: e.target.value })}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Reason / Purpose of Stay *</label>
                                                <select
                                                    className="form-control"
                                                    value={walkInForm.reason_for_stay}
                                                    onChange={e => setWalkInForm({ ...walkInForm, reason_for_stay: e.target.value })}
                                                    required={guestMode === 'new_walk_in'}
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
                                                    value={walkInForm.id_proof}
                                                    onChange={e => setWalkInForm({ ...walkInForm, id_proof: e.target.value })}
                                                    required={guestMode === 'new_walk_in'}
                                                >
                                                    <option value="National ID">National ID / Kebele</option>
                                                    <option value="Passport">Passport</option>
                                                    <option value="Driver License">Driver's License</option>
                                                    <option value="Residence Permit">Residence Permit</option>
                                                    <option value="Other">Other ID</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">ID Number / Kebele / Passport *</label>
                                                <input
                                                    className="form-control"
                                                    placeholder="e.g. EP-987654 or Kebele ID #"
                                                    value={walkInForm.id_number}
                                                    onChange={e => setWalkInForm({ ...walkInForm, id_number: e.target.value })}
                                                    required={guestMode === 'new_walk_in'}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label">Address / Origin City</label>
                                            <input
                                                className="form-control"
                                                placeholder="e.g. Addis Ababa, Bole Sub-city"
                                                value={walkInForm.address}
                                                onChange={e => setWalkInForm({ ...walkInForm, address: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Room Selection */}
                                <div className="form-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <label className="form-label" style={{ margin: 0 }}>Select Room *</label>
                                        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#2563eb', fontWeight: 600 }}>
                                            <input
                                                type="checkbox"
                                                checked={onlyAvailableRooms}
                                                onChange={e => setOnlyAvailableRooms(e.target.checked)}
                                            />
                                            Only Available Rooms ({availableRoomsCount} available)
                                        </label>
                                    </div>
                                    <select className="form-control" value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })} required>
                                        <option value="">-- Choose an Available Room --</option>
                                        {(onlyAvailableRooms && !editId ? rooms.filter(r => r.status === 'available') : rooms).map(r => (
                                            <option key={r.id} value={r.id} disabled={r.status === 'maintenance'}>
                                                Room {r.room_number} — {r.type} [{r.status.toUpperCase()}] — ETB {Number(r.price_per_night).toLocaleString()}/night (Max {r.max_guests || 2} guests)
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Room Info Banner if Selected */}
                                {modalSelectedRoom && (
                                    <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, border: '1px solid #bfdbfe', color: '#1e40af' }}>
                                        <div style={{ fontWeight: 600 }}>
                                            Room {modalSelectedRoom.room_number} ({modalSelectedRoom.type}) — {modalSelectedRoom.status.toUpperCase()}
                                        </div>
                                        <div style={{ color: '#4b5563', marginTop: 2 }}>
                                            Rate: ETB {Number(modalSelectedRoom.price_per_night).toLocaleString()} per night • Max Guests: {modalSelectedRoom.max_guests || 2}
                                        </div>
                                    </div>
                                )}

                                {/* Stay Dates */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Check In *</label>
                                        <input
                                            className="form-control"
                                            type="date"
                                            value={form.check_in}
                                            onChange={e => setForm({ ...form, check_in: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Check Out *</label>
                                        <input
                                            className="form-control"
                                            type="date"
                                            min={form.check_in || undefined}
                                            value={form.check_out}
                                            onChange={e => setForm({ ...form, check_out: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Dining & Bar Selection & Recommendations Component */}
                                {!editId && (
                                    <BookingDiningSelector
                                        selectedItems={diningPreOrder.items}
                                        onItemsChange={setDiningPreOrder}
                                        roomNumber={modalSelectedRoom?.room_number || ''}
                                        currency="ETB"
                                    />
                                )}

                                {/* Cost summary banner */}
                                {modalSelectedRoom && modalNights > 0 && (
                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', marginBottom: 14, color: '#166534', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>🛏️ <strong>Room {modalSelectedRoom.room_number}</strong> × {modalNights} night{modalNights > 1 ? 's' : ''}</span>
                                            <span>ETB {modalRoomCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        {diningPreOrder.total > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#059669', fontWeight: 600 }}>
                                                <span>🍽️ Pre-ordered Dining & Bar ({diningPreOrder.items.length} items)</span>
                                                <span>+ETB {diningPreOrder.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #bbf7d0', paddingTop: 6, fontWeight: 700, fontSize: 15 }}>
                                            <span>Total Value Payable:</span>
                                            <span style={{ color: '#15803d' }}>ETB {Number(modalEstimate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                )}

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
                                        {['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'].map(s => (
                                            <option key={s} value={s} style={{ textTransform: 'capitalize' }}>
                                                {s.replace('_', ' ')}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Special Requests</label>
                                    <textarea className="form-control" rows={2} placeholder="Any special needs or preferences..." value={form.special_requests} onChange={e => setForm({ ...form, special_requests: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Processing...' : editId ? 'Update Booking' : 'Register & Create Booking'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Quick Guest Registration Modal */}
            {quickGuestModal && (
                <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && setQuickGuestModal(false)}>
                    <div className="modal" style={{ maxWidth: 520 }}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <UserPlus size={18} color="#2563eb" /> Quick Guest Registration (Format Rule)
                            </h3>
                            <button className="btn btn-icon btn-outline" onClick={() => setQuickGuestModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleQuickGuestSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Full Name *</label>
                                        <input
                                            className="form-control"
                                            value={quickGuestForm.name}
                                            onChange={e => setQuickGuestForm({ ...quickGuestForm, name: e.target.value })}
                                            required
                                            placeholder="Guest full name"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Email *</label>
                                        <input
                                            className="form-control"
                                            type="email"
                                            value={quickGuestForm.email}
                                            onChange={e => setQuickGuestForm({ ...quickGuestForm, email: e.target.value })}
                                            required
                                            placeholder="guest@example.com"
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Phone</label>
                                        <input
                                            className="form-control"
                                            value={quickGuestForm.phone}
                                            onChange={e => setQuickGuestForm({ ...quickGuestForm, phone: e.target.value })}
                                            placeholder="+251 91 123 4567"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Reason / Purpose of Stay *</label>
                                        <select
                                            className="form-control"
                                            value={quickGuestForm.reason_for_stay}
                                            onChange={e => setQuickGuestForm({ ...quickGuestForm, reason_for_stay: e.target.value })}
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
                                            value={quickGuestForm.id_proof}
                                            onChange={e => setQuickGuestForm({ ...quickGuestForm, id_proof: e.target.value })}
                                        >
                                            <option value="National ID">National ID / Kebele</option>
                                            <option value="Passport">Passport</option>
                                            <option value="Driver License">Driver's License</option>
                                            <option value="Residence Permit">Residence Permit</option>
                                            <option value="Other">Other ID</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">ID Number</label>
                                        <input
                                            className="form-control"
                                            value={quickGuestForm.id_number}
                                            onChange={e => setQuickGuestForm({ ...quickGuestForm, id_number: e.target.value })}
                                            placeholder="e.g. EP-998877"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setQuickGuestModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={savingQuickGuest}>
                                    {savingQuickGuest ? 'Registering...' : 'Save & Select Guest'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DEDICATED FRONT DESK CHECK-IN MODAL */}
            {checkInModal && checkInBookingData && (
                <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={e => e.target === e.currentTarget && setCheckInModal(false)}>
                    <div className="modal" style={{ maxWidth: 560 }}>
                        <div className="modal-header" style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534' }}>
                                <LogIn color="#16a34a" size={20} /> Guest Check-In & Arrival Form
                            </h3>
                            <button className="btn btn-icon btn-outline" onClick={() => setCheckInModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCheckInSubmit}>
                            <div className="modal-body">
                                {/* Guest & Room Details Header Box */}
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px', marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                                                {checkInBookingData.guest_name}
                                            </div>
                                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                                {checkInBookingData.guest_email || checkInBookingData.guest_phone || 'No contact provided'}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', background: '#dbeafe', padding: '3px 8px', borderRadius: 4 }}>
                                                Room {checkInBookingData.room_number} ({checkInBookingData.room_type})
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                                        <div>
                                            <span style={{ color: '#64748b' }}>Reason for Stay:</span>
                                            <div style={{ fontWeight: 600 }}>{checkInBookingData.reason_for_stay || 'Tourism / Leisure'}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b' }}>ID Proof ({checkInBookingData.id_proof || 'ID'}):</span>
                                            <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{checkInBookingData.id_number || 'Verified'}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b' }}>Stay Duration:</span>
                                            <div style={{ fontWeight: 600 }}>{checkInBookingData.check_in} ➔ {checkInBookingData.check_out}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Billing & Financial Summary */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16, textAlign: 'center' }}>
                                    <div style={{ background: '#eff6ff', padding: 10, borderRadius: 6, border: '1px solid #bfdbfe' }}>
                                        <div style={{ fontSize: 11, color: '#1e40af' }}>Total Stay Cost</div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e3a8a' }}>
                                            ETB {Number(checkInBookingData.total_amount || 0).toFixed(2)}
                                        </div>
                                    </div>
                                    <div style={{ background: '#f0fdf4', padding: 10, borderRadius: 6, border: '1px solid #bbf7d0' }}>
                                        <div style={{ fontSize: 11, color: '#166534' }}>Already Paid</div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#14532d' }}>
                                            ETB {Number(checkInBookingData.paid_amount || 0).toFixed(2)}
                                        </div>
                                    </div>
                                    <div style={{ background: Number(checkInBookingData.balance_amount || 0) > 0 ? '#fef2f2' : '#f0fdf4', padding: 10, borderRadius: 6, border: Number(checkInBookingData.balance_amount || 0) > 0 ? '1px solid #fecaca' : '1px solid #bbf7d0' }}>
                                        <div style={{ fontSize: 11, color: Number(checkInBookingData.balance_amount || 0) > 0 ? '#991b1b' : '#166534' }}>
                                            Balance Remaining
                                        </div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: Number(checkInBookingData.balance_amount || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                                            ETB {Number(checkInBookingData.balance_amount || 0).toFixed(2)}
                                        </div>
                                    </div>
                                </div>

                                {/* Check-In Payment Collection Form */}
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
                                            <input
                                                type="checkbox"
                                                checked={checkInForm.collect_payment}
                                                onChange={e => setCheckInForm({ ...checkInForm, collect_payment: e.target.checked })}
                                            />
                                            Record Payment / Advance Deposit Now
                                        </label>
                                        <span style={{ fontSize: 11, color: '#64748b' }}>Optional at check-in</span>
                                    </div>

                                    {checkInForm.collect_payment && (
                                        <>
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label">Payment Amount (ETB) *</label>
                                                    <input
                                                        className="form-control"
                                                        type="number"
                                                        step="0.01"
                                                        value={checkInForm.payment_amount}
                                                        onChange={e => setCheckInForm({ ...checkInForm, payment_amount: e.target.value })}
                                                        required={checkInForm.collect_payment}
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Payment Method *</label>
                                                    <select
                                                        className="form-control"
                                                        value={checkInForm.payment_method}
                                                        onChange={e => setCheckInForm({ ...checkInForm, payment_method: e.target.value })}
                                                        required={checkInForm.collect_payment}
                                                    >
                                                        {PAYMENT_METHODS.map(m => (
                                                            <option key={m.value} value={m.value}>
                                                                {m.icon} {m.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label">Transaction / Ref ID</label>
                                                    <input
                                                        className="form-control"
                                                        value={checkInForm.transaction_id}
                                                        onChange={e => setCheckInForm({ ...checkInForm, transaction_id: e.target.value })}
                                                        placeholder="e.g. Telebirr Txn # / CBE Ref code"
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Staff Remarks</label>
                                                    <input
                                                        className="form-control"
                                                        value={checkInForm.notes}
                                                        onChange={e => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                                                        placeholder="Check-in deposit / notes"
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer" style={{ background: '#f8fafc' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setCheckInModal(false)}>Cancel</button>
                                <button
                                    type="submit"
                                    className="btn"
                                    style={{ background: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                                    disabled={checkingIn}
                                >
                                    <LogIn size={16} /> {checkingIn ? 'Checking In...' : 'Confirm Check-In & Mark Room Occupied'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DEDICATED FRONT DESK CHECK-OUT MODAL */}
            {checkOutModal && checkOutBookingData && (
                <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={e => e.target === e.currentTarget && setCheckOutModal(false)}>
                    <div className="modal" style={{ maxWidth: 560 }}>
                        <div className="modal-header" style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1e40af' }}>
                                <LogOut color="#2563eb" size={20} /> Guest Check-Out & Billing Settlement
                            </h3>
                            <button className="btn btn-icon btn-outline" onClick={() => setCheckOutModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCheckOutSubmit}>
                            <div className="modal-body">
                                {/* Summary Box */}
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px', marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                                                {checkOutBookingData.guest_name}
                                            </div>
                                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                                Reservation #{checkOutBookingData.id} • {checkOutBookingData.guest_email || checkOutBookingData.guest_phone || 'Front Desk'}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', background: '#dbeafe', padding: '3px 8px', borderRadius: 4 }}>
                                                Room {checkOutBookingData.room_number} ({checkOutBookingData.room_type})
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
                                        Dates of stay: <strong>{checkOutBookingData.check_in}</strong> to <strong>{checkOutBookingData.check_out}</strong>
                                    </div>
                                </div>

                                {/* Financial Balance Card */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16, textAlign: 'center' }}>
                                    <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: 11, color: '#64748b' }}>Total Stay Charges</div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                                            ETB {Number(checkOutBookingData.total_amount || 0).toFixed(2)}
                                        </div>
                                    </div>
                                    <div style={{ background: '#f0fdf4', padding: 10, borderRadius: 6, border: '1px solid #bbf7d0' }}>
                                        <div style={{ fontSize: 11, color: '#166534' }}>Payments Received</div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#15803d' }}>
                                            ETB {Number(checkOutBookingData.paid_amount || 0).toFixed(2)}
                                        </div>
                                    </div>
                                    <div style={{ background: Number(checkOutBookingData.balance_amount || 0) > 0 ? '#fef2f2' : '#f0fdf4', padding: 10, borderRadius: 6, border: Number(checkOutBookingData.balance_amount || 0) > 0 ? '1px solid #fecaca' : '1px solid #bbf7d0' }}>
                                        <div style={{ fontSize: 11, color: Number(checkOutBookingData.balance_amount || 0) > 0 ? '#991b1b' : '#166534' }}>
                                            Outstanding Due
                                        </div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: Number(checkOutBookingData.balance_amount || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                                            ETB {Number(checkOutBookingData.balance_amount || 0).toFixed(2)}
                                        </div>
                                    </div>
                                </div>

                                {/* Settlement Section */}
                                {Number(checkOutBookingData.balance_amount || 0) > 0 ? (
                                    <div style={{ border: '1px solid #fed7aa', background: '#fffbeb', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c2410c', fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                                            <AlertCircle size={16} /> Settle Remaining Balance (ETB {Number(checkOutBookingData.balance_amount || 0).toFixed(2)})
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="form-label">Payment Amount (ETB) *</label>
                                                <input
                                                    className="form-control"
                                                    type="number"
                                                    step="0.01"
                                                    value={checkOutForm.payment_amount}
                                                    onChange={e => setCheckOutForm({ ...checkOutForm, payment_amount: e.target.value })}
                                                    required
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Payment Method *</label>
                                                <select
                                                    className="form-control"
                                                    value={checkOutForm.payment_method}
                                                    onChange={e => setCheckOutForm({ ...checkOutForm, payment_method: e.target.value })}
                                                    required
                                                >
                                                    {PAYMENT_METHODS.map(m => (
                                                        <option key={m.value} value={m.value}>
                                                            {m.icon} {m.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="form-label">Transaction / Ref ID</label>
                                                <input
                                                    className="form-control"
                                                    value={checkOutForm.transaction_id}
                                                    onChange={e => setCheckOutForm({ ...checkOutForm, transaction_id: e.target.value })}
                                                    placeholder="e.g. Telebirr Txn # / CBE Receipt"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Settlement Notes</label>
                                                <input
                                                    className="form-control"
                                                    value={checkOutForm.notes}
                                                    onChange={e => setCheckOutForm({ ...checkOutForm, notes: e.target.value })}
                                                    placeholder="e.g. Full settlement at departure"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, color: '#166534', fontSize: 13 }}>
                                        <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0 }} />
                                        <div>
                                            <strong>All charges are fully settled!</strong> No outstanding balance remaining for this reservation.
                                        </div>
                                    </div>
                                )}

                                {/* Auto Room Status Note */}
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#475569' }}>
                                    ✨ <strong>Automatic Automation:</strong> Confirming check-out will mark Room <strong>{checkOutBookingData.room_number}</strong> status as <strong>Cleaning</strong> for housekeeping, and finalize the invoice as <strong>Paid</strong>.
                                </div>
                            </div>
                            <div className="modal-footer" style={{ background: '#f8fafc' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setCheckOutModal(false)}>Cancel</button>
                                <button
                                    type="submit"
                                    className="btn"
                                    style={{ background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                                    disabled={checkingOut}
                                >
                                    <LogOut size={16} /> {checkingOut ? 'Checking Out...' : 'Confirm Check-Out & Release Room'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
