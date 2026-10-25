import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
    Plus, BookOpen, FileText, XCircle, Zap, ShieldCheck, 
    UserCheck, CreditCard, CheckCircle2, AlertCircle, 
    Smartphone, Copy, Check, Sparkles, Utensils, ArrowRight,
    Building2, Trees, Hotel
} from 'lucide-react'
import toast from 'react-hot-toast'
import { 
    getMyBookings, createBooking, updateBooking, getRooms, 
    getInvoices, PAYMENT_METHODS, predictFreeRooms, getHotelAIDining 
} from '../services/api'
import { launchChapaCheckout } from '../utils/chapa'
import { useAuth } from '../context/AuthContext'
import BookingDiningSelector from '../components/dining/BookingDiningSelector'
import HotelBuildingParkShowcase from '../components/HotelBuildingParkShowcase'

const statusBadge = { pending: 'badge-warning', confirmed: 'badge-info', checked_in: 'badge-success', checked_out: 'badge-gray', cancelled: 'badge-danger' }
const invoiceStatusBadge = { draft: 'badge-gray', sent: 'badge-info', paid: 'badge-success', overdue: 'badge-danger' }

export default function CustomerPortal() {
    const { user } = useAuth()
    const [tab, setTab] = useState('building_park')
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
        id_number: '',
        payment_method: 'chapa',
        payment_amount: '',
        transaction_id: '',
        payment_notes: ''
    })
    const [saving, setSaving] = useState(false)
    const [copiedText, setCopiedText] = useState(null)

    const handleCopy = (text) => {
        if (!text) return
        navigator.clipboard?.writeText(text)
        setCopiedText(text)
        toast.success(`Copied ${text} to clipboard!`)
        setTimeout(() => setCopiedText(null), 2500)
    }

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
            id_number: user?.id_number || '',
            payment_method: 'chapa',
            payment_amount: '',
            transaction_id: '',
            payment_notes: ''
        })
        setModal(true)
    }

    const handleChapaPay = async (bookingId, amount) => {
        setPayingBookingId(bookingId)
        try {
            await launchChapaCheckout({
                bookingId: Number(bookingId),
                amount: Number(amount),
                name: user?.name,
                email: user?.email,
                phone: user?.phone
            })
        } catch {
            // Error notification handled by launchChapaCheckout
        } finally {
            setPayingBookingId(null)
        }
    }

    const load = () => {
        setLoading(true)
        Promise.all([getMyBookings(), getRooms('available'), getInvoices()])
            .then(([b, r, inv]) => {
                setBookings(Array.isArray(b?.data) ? b.data : [])
                setRooms(Array.isArray(r?.data) ? r.data : [])
                setInvoices(Array.isArray(inv?.data) ? inv.data : [])
            })
            .catch(() => {
                setBookings([])
                setRooms([])
                setInvoices([])
                toast.error('Failed to load portal data')
            })
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    // Hotel AI State & Live Prediction
    const [aiPredictions, setAiPredictions] = useState(null)
    const [aiPredicting, setAiPredicting] = useState(false)
    const [showAiAssistant, setShowAiAssistant] = useState(true)

    // Listen for events from Hotel AI Widget
    useEffect(() => {
        const handleAiBookRoom = (e) => {
            const { room, context } = e.detail || {}
            if (!room) return
            openBookingModal()
            setForm(prev => ({
                ...prev,
                room_id: room.id,
                check_in: context?.check_in || room.check_in || prev.check_in,
                check_out: context?.check_out || room.check_out || prev.check_out,
                adults: context?.guests || prev.adults || 1
            }))
            toast.success(`Hotel AI selected Room #${room.room_number}! Finish reserving below.`, { icon: '🤖' })
        }

        const handleAiAddDining = (e) => {
            const { item } = e.detail || {}
            if (!item) return
            setDiningPreOrder(prev => {
                const existingIndex = prev.items.findIndex(i => i.id === item.id)
                let updatedItems = []
                if (existingIndex >= 0) {
                    updatedItems = prev.items.map((i, idx) => idx === existingIndex ? { ...i, qty: (i.qty || 1) + 1 } : i)
                } else {
                    updatedItems = [...prev.items, { ...item, qty: 1 }]
                }
                const newTotal = updatedItems.reduce((acc, curr) => acc + (Number(curr.price) * (curr.qty || 1)), 0)
                return {
                    ...prev,
                    items: updatedItems,
                    total: Number(newTotal.toFixed(2))
                }
            })
            toast.success(`Hotel AI added ${item.name} to pre-order!`, { icon: '🍽️' })
        }

        window.addEventListener('hotel-ai-book-room', handleAiBookRoom)
        window.addEventListener('hotel-ai-add-dining', handleAiAddDining)
        return () => {
            window.removeEventListener('hotel-ai-book-room', handleAiBookRoom)
            window.removeEventListener('hotel-ai-add-dining', handleAiAddDining)
        }
    }, [])

    const handlePredictWithHotelAI = async () => {
        const today = new Date().toISOString().split('T')[0]
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
        const checkIn = form.check_in || today
        const checkOut = form.check_out || tomorrow

        if (!form.check_in || !form.check_out) {
            setForm(prev => ({
                ...prev,
                check_in: checkIn,
                check_out: checkOut
            }))
        }

        setAiPredicting(true)
        try {
            const res = await predictFreeRooms({
                check_in: checkIn,
                check_out: checkOut,
                guests: form.adults || 1
            })
            setAiPredictions(res.data)
            toast.success(`Hotel AI predicted ${res.data.free_count} available room(s)!`, { icon: '🤖' })
        } catch (err) {
            console.error(err)
            toast.error('Hotel AI prediction request failed')
        } finally {
            setAiPredicting(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.room_id) return toast.error('Please select an available room')
        if (form.check_in >= form.check_out) return toast.error('Check-out must be after check-in')
        if (!form.name?.trim()) return toast.error('Full name is required by hotel registration rules')
        if (!form.id_number?.trim()) return toast.error('ID number is required by hotel registration rules')
        if (!form.payment_method) return toast.error('Payment method is required before booking can be saved')

        const selectedRoomObj = rooms.find(r => r.id == form.room_id)
        const stayNights = form.check_in && form.check_out ? Math.max(1, (new Date(form.check_out) - new Date(form.check_in)) / 86400000) : 1
        const stayCost = selectedRoomObj ? stayNights * Number(selectedRoomObj.price_per_night) : 0
        const totalDue = Number((stayCost + (diningPreOrder?.total || 0)).toFixed(2))

        const payableAmount = form.payment_amount ? Number(form.payment_amount) : totalDue
        if (payableAmount <= 0) return toast.error('Payment amount must be greater than 0')

        if (form.payment_method !== 'chapa' && !form.transaction_id?.trim()) {
            return toast.error('Please enter transaction reference / receipt code to verify your payment')
        }

        setSaving(true)
        try {
            if (form.payment_method === 'chapa') {
                // Initialize booking with Chapa payment gateway
                const res = await createBooking({
                    ...form,
                    guest_id: user.id,
                    payment_method: 'chapa',
                    payment_amount: payableAmount,
                    transaction_id: form.transaction_id?.trim() || ('CHAPA-' + Date.now()),
                    status: 'pending',
                    dining_items: diningPreOrder.items,
                    dining_total: diningPreOrder.total,
                    dining_delivery_time: diningPreOrder.deliveryTime,
                    dining_notes: diningPreOrder.diningNotes
                })
                const newBookingId = res.data?.id
                toast.success('Registration created! Opening Chapa payment gateway...')
                setModal(false)
                load()
                await launchChapaCheckout({
                    bookingId: Number(newBookingId),
                    amount: payableAmount,
                    name: form.name || user?.name,
                    email: user?.email,
                    phone: form.phone || user?.phone
                })
            } else {
                // Direct payment methods: Telebirr, CBE Birr, Awash, Cash, Card, Bank Transfer (Sent to Admin Account)
                await createBooking({
                    ...form,
                    guest_id: user.id,
                    payment_method: form.payment_method,
                    payment_amount: payableAmount,
                    transaction_id: form.transaction_id.trim(),
                    notes: form.payment_notes || `Direct Payment to Admin Account (0932338138 - Mulugeta Fisiha) via ${form.payment_method}`,
                    status: 'confirmed',
                    dining_items: diningPreOrder.items,
                    dining_total: diningPreOrder.total,
                    dining_delivery_time: diningPreOrder.deliveryTime,
                    dining_notes: diningPreOrder.diningNotes
                })
                toast.success('Payment recorded to Admin Account! Pop-up alert sent to Administrator phone.')
                setModal(false)
                load()
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to submit booking registration')
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
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link
                        to="/landing"
                        className="btn btn-outline"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                    >
                        <Hotel size={16} color="var(--tp-acc, #22c55e)" />
                        <span>Hotel Showcase & Park</span>
                    </Link>
                    <button
                        id="btn-ask-hotel-ai"
                        type="button"
                        className="btn"
                        style={{
                            background: 'linear-gradient(135deg, #0284c7 0%, #3b82f6 100%)',
                            color: '#fff',
                            border: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                            fontWeight: 600
                        }}
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('open-hotel-ai', {
                                detail: { query: 'Predict free rooms and tell me which dining is available in this hotel' }
                            }))
                        }}
                    >
                        <Sparkles size={16} color="#fde047" /> Ask Hotel AI (EN / አማርኛ)
                    </button>
                    <button className="btn btn-primary" onClick={openBookingModal}>
                        <Plus size={16} /> Book an Available Room
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <button style={tabStyle(tab === 'building_park')} onClick={() => setTab('building_park')}>
                    <Building2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />6-Floor Building & Park
                </button>
                <button style={tabStyle(tab === 'bookings')} onClick={() => setTab('bookings')}>
                    <BookOpen size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />My Bookings ({bookings?.length || 0})
                </button>
                <button style={tabStyle(tab === 'invoices')} onClick={() => setTab('invoices')}>
                    <FileText size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />My Invoices ({invoices?.length || 0})
                </button>
            </div>

            {loading ? (
                <div className="loading"><div className="spinner" />Loading your portal...</div>
            ) : (
                <>
                    {/* ── 6-Floor Building & Resort Park Showcase ── */}
                    {tab === 'building_park' && (
                        <HotelBuildingParkShowcase 
                            onSelectRoom={(room) => {
                                openBookingModal()
                                setForm(prev => ({
                                    ...prev,
                                    room_id: room.id
                                }))
                            }}
                            onOpenAI={(prompt) => {
                                window.dispatchEvent(new CustomEvent('open-hotel-ai', { detail: { query: prompt } }))
                            }}
                        />
                    )}

                    {/* ── Bookings Tab ── */}
                    {tab === 'bookings' && (
                        (!Array.isArray(bookings) || bookings.length === 0) ? (
                            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                                <BookOpen size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} />
                                <h3 style={{ marginBottom: 8, color: '#374151' }}>No bookings yet</h3>
                                <p style={{ color: '#9ca3af', marginBottom: 20 }}>Explore our available rooms and register your stay!</p>
                                <button className="btn btn-primary" onClick={openBookingModal}>Book Now</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {(Array.isArray(bookings) ? bookings : []).map(b => (
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
                                            {(Array.isArray(invoices) ? invoices : []).map(inv => (
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
                                {/* ── HOTEL AI PREDICTION & CONCIERGE ASSISTANT ── */}
                                <div style={{
                                    background: 'linear-gradient(135deg, #0b192c 0%, #082f49 100%)',
                                    border: '1px solid rgba(56, 189, 248, 0.4)',
                                    borderRadius: 12,
                                    padding: 14,
                                    marginBottom: 16,
                                    color: '#e0f2fe'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#38bdf8' }}>
                                            <Sparkles size={16} color="#fde047" />
                                            Hotel AI — Free Room & Dining Predictor (English / አማርኛ)
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent('open-hotel-ai', {
                                                    detail: {
                                                        query: `Predict free rooms for ${form.check_in || 'my stay'} and tell me what dining is available`,
                                                        context: { check_in: form.check_in, check_out: form.check_out, guests: form.adults }
                                                    }
                                                }))
                                            }}
                                            style={{
                                                background: 'rgba(56, 189, 248, 0.15)',
                                                border: '1px solid rgba(56, 189, 248, 0.4)',
                                                color: '#38bdf8',
                                                borderRadius: 6,
                                                padding: '3px 8px',
                                                fontSize: 11,
                                                cursor: 'pointer',
                                                fontWeight: 600
                                            }}
                                        >
                                            💬 Chat (EN / አማርኛ)
                                        </button>
                                    </div>

                                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                                        Hotel AI predicts guaranteed free rooms and recommends dining in both English & Amharic (አማርኛ).
                                    </p>

                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            onClick={handlePredictWithHotelAI}
                                            disabled={aiPredicting}
                                            style={{
                                                background: '#0284c7',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: 6,
                                                padding: '6px 12px',
                                                fontSize: 12,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 6
                                            }}
                                        >
                                            <Sparkles size={13} color="#fde047" />
                                            {aiPredicting ? 'Hotel AI Predicting...' : '⚡ Predict Free Rooms for Dates'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent('open-hotel-ai', {
                                                    detail: { query: 'Which dining is available in this hotel?' }
                                                }))
                                            }}
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.08)',
                                                color: '#bae6fd',
                                                border: '1px solid rgba(56, 189, 248, 0.25)',
                                                borderRadius: 6,
                                                padding: '6px 10px',
                                                fontSize: 12,
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 5
                                            }}
                                        >
                                            <Utensils size={13} color="#fde047" />
                                            Check Available Dining
                                        </button>
                                    </div>

                                    {/* Predicted rooms results */}
                                    {aiPredictions && (
                                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(56, 189, 248, 0.2)' }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>
                                                ✓ {aiPredictions.free_count} Free Room(s) Predicted ({aiPredictions.check_in} to {aiPredictions.check_out}):
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {aiPredictions.available_rooms.slice(0, 3).map(r => (
                                                    <div 
                                                        key={r.id} 
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            background: 'rgba(15, 23, 42, 0.7)',
                                                            border: '1px solid rgba(56, 189, 248, 0.2)',
                                                            borderRadius: 6,
                                                            padding: '6px 10px',
                                                            fontSize: 11
                                                        }}
                                                    >
                                                        <div>
                                                            <span style={{ fontWeight: 700, color: '#fff' }}>Room #{r.room_number}</span>
                                                            <span style={{ color: '#38bdf8', marginLeft: 6, textTransform: 'capitalize' }}>({r.type})</span>
                                                            <span style={{ color: '#94a3b8', marginLeft: 6 }}>• ${r.price_per_night}/night</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setForm(prev => ({ ...prev, room_id: r.id }))
                                                                toast.success(`Selected Room #${r.room_number}!`)
                                                            }}
                                                            style={{
                                                                background: form.room_id == r.id ? '#059669' : 'rgba(56, 189, 248, 0.25)',
                                                                color: '#fff',
                                                                border: 'none',
                                                                borderRadius: 4,
                                                                padding: '3px 8px',
                                                                fontSize: 10,
                                                                fontWeight: 700,
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {form.room_id == r.id ? '✓ Selected' : 'Choose'}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

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

                                {/* MANDATORY PAYMENT REQUIREMENT SECTION */}
                                <div style={{ background: '#f8fafc', border: '1.5px solid #3b82f6', borderRadius: 10, padding: 16, margin: '16px 0', boxShadow: '0 4px 12px rgba(59,130,246,0.08)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <CreditCard size={18} color="#2563eb" /> Payment Required Before Registration
                                        </div>
                                        <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                                            Mandatory Step
                                        </span>
                                    </div>
                                    <p style={{ fontSize: 12, color: '#4b5563', margin: '0 0 12px', lineHeight: 1.5 }}>
                                        Hotel registration policy requires payment before booking can be saved. Please select a payment method below to complete payment and immediately secure Room {selectedRoom?.room_number || ''}.
                                    </p>

                                    {/* Payment Method Selector Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
                                        {PAYMENT_METHODS.map(m => {
                                            const isSelected = form.payment_method === m.value
                                            return (
                                                <button
                                                    key={m.value}
                                                    type="button"
                                                    onClick={() => setForm({ ...form, payment_method: m.value })}
                                                    style={{
                                                        padding: '10px 8px',
                                                        borderRadius: 8,
                                                        border: isSelected ? '2px solid #2563eb' : '1px solid #d1d5db',
                                                        background: isSelected ? '#eff6ff' : '#ffffff',
                                                        color: isSelected ? '#1e40af' : '#374151',
                                                        cursor: 'pointer',
                                                        fontSize: 12,
                                                        fontWeight: isSelected ? 700 : 500,
                                                        textAlign: 'center',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <span style={{ fontSize: 18 }}>{m.icon}</span>
                                                    <span style={{ lineHeight: 1.2 }}>{m.label.split('(')[0].trim()}</span>
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {/* Payment Instructions & Official Admin Mobile Banking Details Box */}
                                    <div style={{ background: '#f8fafc', border: '1.5px solid #10b981', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#065f46', fontWeight: 800, fontSize: 13 }}>
                                                <Smartphone size={17} color="#059669" />
                                                <span>Send Money to Hotel Admin Account Only</span>
                                            </div>
                                            <span style={{ fontSize: 11, background: '#d1fae5', color: '#047857', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                                                🛡️ Admin Account
                                            </span>
                                        </div>

                                        {/* Official Admin Details Card with Copy Buttons */}
                                        <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                                                <span style={{ color: '#64748b' }}>Account Holder / Admin:</span>
                                                <strong style={{ color: '#0f172a' }}>Mulugeta Fisiha (Hotel Administrator)</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                                                <span style={{ color: '#64748b' }}>Admin Phone / Telebirr:</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <strong style={{ color: '#065f46', fontFamily: 'monospace', fontSize: 14 }}>0932338138</strong>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopy('0932338138')}
                                                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                    >
                                                        {copiedText === '0932338138' ? <><Check size={12} color="#059669" /> Copied</> : <><Copy size={12} /> Copy</>}
                                                    </button>
                                                </div>
                                            </div>

                                            {(form.payment_method === 'cbe_birr' || form.payment_method === 'bank_transfer') && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                                                    <span style={{ color: '#64748b' }}>CBE Account Number:</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <strong style={{ color: '#1e3a8a', fontFamily: 'monospace', fontSize: 13 }}>1000348291048</strong>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopy('1000348291048')}
                                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                        >
                                                            {copiedText === '1000348291048' ? <><Check size={12} color="#059669" /> Copied</> : <><Copy size={12} /> Copy</>}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {form.payment_method === 'awash_birr' && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                                                    <span style={{ color: '#64748b' }}>Awash Account Number:</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <strong style={{ color: '#1e3a8a', fontFamily: 'monospace', fontSize: 13 }}>0130482910492</strong>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopy('0130482910492')}
                                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                        >
                                                            {copiedText === '0130482910492' ? <><Check size={12} color="#059669" /> Copied</> : <><Copy size={12} /> Copy</>}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {form.payment_method === 'boa' && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                                                    <span style={{ color: '#64748b' }}>BOA Account Number:</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <strong style={{ color: '#1e3a8a', fontFamily: 'monospace', fontSize: 13 }}>49201948</strong>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopy('49201948')}
                                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                        >
                                                            {copiedText === '49201948' ? <><Check size={12} color="#059669" /> Copied</> : <><Copy size={12} /> Copy</>}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Dynamic instructions based on selected method */}
                                        <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>
                                            {form.payment_method === 'chapa' && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1e40af' }}>
                                                    <Zap size={16} color="#2563eb" />
                                                    <span>Chapa Gateway: Supports Visa, Mastercard, Telebirr & CBE via secure modal. Funds settle directly into Admin Account.</span>
                                                </div>
                                            )}
                                            {form.payment_method === 'telebirr' && (
                                                <div style={{ color: '#047857' }}>
                                                    📱 <strong>Telebirr Transfer:</strong> Open your Telebirr app ➔ Send to Admin Phone <strong>0932338138</strong> (Mulugeta Fisiha) ➔ Paste your Transaction Reference code below.
                                                </div>
                                            )}
                                            {form.payment_method === 'cbe_birr' && (
                                                <div style={{ color: '#7c2d12' }}>
                                                    🏦 <strong>CBE Birr:</strong> Send via CBE Birr to Phone <strong>0932338138</strong> or CBE Account <strong>1000348291048</strong> ➔ Enter confirmation code below.
                                                </div>
                                            )}
                                            {form.payment_method === 'awash_birr' && (
                                                <div style={{ color: '#1e3a8a' }}>
                                                    🏛️ <strong>Awash Birr:</strong> Transfer via Awash Bank to Phone <strong>0932338138</strong> or Account <strong>0130482910492</strong> ➔ Enter reference code below.
                                                </div>
                                            )}
                                            {form.payment_method === 'boa' && (
                                                <div style={{ color: '#1e3a8a' }}>
                                                    💳 <strong>Bank of Abyssinia:</strong> Send to BOA Account <strong>49201948</strong> (Mulugeta Fisiha) ➔ Enter slip reference code below.
                                                </div>
                                            )}
                                            {form.payment_method === 'cash' && (
                                                <div style={{ color: '#166534' }}>
                                                    💵 <strong>Cash at Reception:</strong> Pay cash at front desk upon check-in. Staff registers deposit under Admin oversight.
                                                </div>
                                            )}
                                            {['card', 'bank_transfer'].includes(form.payment_method) && (
                                                <div style={{ color: '#374151' }}>
                                                    🔄 <strong>Direct Bank Transfer:</strong> Transfer to CBE Account <strong>1000348291048</strong> (Mulugeta Fisiha) ➔ Paste transfer code below.
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ marginTop: 8, fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <CheckCircle2 size={13} color="#059669" />
                                            <span>When submitted, an instant real-time pop-up notification alerts the Admin's phone with your payment method!</span>
                                        </div>
                                    </div>

                                    {/* Amount and Transaction Reference Inputs */}
                                    <div className="form-row">
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label">Payment Amount (ETB) *</label>
                                            <input
                                                className="form-control"
                                                type="number"
                                                step="0.01"
                                                value={form.payment_amount !== '' ? form.payment_amount : estimate}
                                                onChange={e => setForm({ ...form, payment_amount: e.target.value })}
                                                placeholder={`Total value: ${estimate}`}
                                                required
                                            />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label">
                                                {form.payment_method === 'chapa' ? 'Chapa Ref (Optional if paying now)' : 'Transaction ID / Receipt # *'}
                                            </label>
                                            <input
                                                className="form-control"
                                                value={form.transaction_id}
                                                onChange={e => setForm({ ...form, transaction_id: e.target.value })}
                                                placeholder={form.payment_method === 'chapa' ? 'Auto-generated or paste tx_ref' : 'e.g. EB-849204 or Receipt #'}
                                                required={form.payment_method !== 'chapa'}
                                            />
                                        </div>
                                    </div>

                                    {form.payment_amount !== '' && Number(form.payment_amount) < Number(estimate) && (
                                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <AlertCircle size={15} color="#d97706" />
                                            <span>
                                                Registering with <strong>Due Balance: ETB {(Number(estimate) - Number(form.payment_amount)).toFixed(2)}</strong>. Hotel staff will see this due at the top-right of their screen to collect remaining settlement.
                                            </span>
                                        </div>
                                    )}
                                </div>

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
                                <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', fontWeight: 700 }}>
                                    <ShieldCheck size={16} />
                                    {saving
                                        ? 'Processing Payment & Booking...'
                                        : form.payment_method === 'chapa'
                                            ? `Pay ETB ${Number(estimate).toLocaleString(undefined, { minimumFractionDigits: 2 })} with Chapa`
                                            : `Confirm Payment & Save Booking`
                                    }
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
