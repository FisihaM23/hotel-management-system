import { useEffect, useState } from 'react'
import { Plus, Pencil, CreditCard, Zap, ShieldCheck, Search, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import { getPayments, createPayment, updatePayment, getBookings, PAYMENT_METHODS } from '../services/api'
import { launchChapaCheckout } from '../utils/chapa'
import { useAuth } from '../context/AuthContext'

const statusBadge = { pending: 'badge-warning', completed: 'badge-success', refunded: 'badge-info', failed: 'badge-danger' }
const emptyForm = { booking_id: '', amount: '', method: 'telebirr', status: 'completed', transaction_id: '', notes: '' }

export default function Payments() {
    const { user } = useAuth()
    const isAdmin = user && user.role === 'admin'
    const [payments, setPayments] = useState([])
    const [bookings, setBookings] = useState([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [chapaModal, setChapaModal] = useState(false)
    const [chapaBookingId, setChapaBookingId] = useState('')
    const [chapaAmount, setChapaAmount] = useState('')
    const [initiatingChapa, setInitiatingChapa] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editId, setEditId] = useState(null)
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')
    const [filterMethod, setFilterMethod] = useState('')
    const [filterStatus, setFilterStatus] = useState('')

    const load = () => {
        setLoading(true)
        Promise.all([getPayments(), getBookings()])
            .then(([p, b]) => { setPayments(p.data); setBookings(b.data) })
            .catch(() => toast.error('Failed to load payments'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal(true) }
    const openEdit = (p) => {
        setForm({ booking_id: p.booking_id, amount: p.amount, method: p.method || 'cash', status: p.status, transaction_id: p.transaction_id || '', notes: p.notes || '' })
        setEditId(p.id); setModal(true)
    }
    const closeModal = () => { setModal(false); setForm(emptyForm); setEditId(null) }

    const handleChapaPay = async (bookingId, amount) => {
        if (!bookingId) return toast.error('Please select a booking')
        const targetBooking = bookings.find(b => b.id == bookingId)
        setInitiatingChapa(true)
        try {
            await launchChapaCheckout({
                bookingId: Number(bookingId),
                amount: Number(amount),
                name: targetBooking?.guest_name,
                email: targetBooking?.guest_email,
                phone: targetBooking?.guest_phone
            })
        } catch {
            // Handled in launchChapaCheckout
        } finally {
            setInitiatingChapa(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            editId ? await updatePayment(editId, form) : await createPayment(form)
            toast.success(editId ? 'Payment updated' : 'Payment recorded successfully')
            closeModal(); load()
        } catch (err) { toast.error(err.response?.data?.error || 'Failed to save payment') }
        finally { setSaving(false) }
    }

    const total = payments.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0)

    const filteredPayments = payments.filter(p => {
        const matchSearch = !search ||
            p.guest_name?.toLowerCase().includes(search.toLowerCase()) ||
            String(p.booking_id).includes(search) ||
            p.transaction_id?.toLowerCase().includes(search.toLowerCase())
        const matchMethod = !filterMethod || p.method === filterMethod
        const matchStatus = !filterStatus || p.status === filterStatus
        return matchSearch && matchMethod && matchStatus
    })

    const renderMethodBadge = (m) => {
        const found = PAYMENT_METHODS.find(item => item.value === m)
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: '#f3f4f6', fontSize: 12, fontWeight: 500, color: '#1f2937' }}>
                <span>{found ? found.icon : '💳'}</span>
                <span>{found ? found.label : (m?.replace('_', ' ') || 'Cash')}</span>
            </span>
        )
    }

    return (
        <div>
            <div className="page-header">
                <h2>Payments Management</h2>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        className="btn"
                        style={{ background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={() => {
                            setChapaBookingId('')
                            setChapaAmount('')
                            setChapaModal(true)
                        }}
                    >
                        <Zap size={16} /> Pay with Chapa
                    </button>
                    <button className="btn btn-primary" onClick={openAdd}><Plus size={16} />Record Payment</button>
                </div>
            </div>

            <div className="stats-grid" style={{ marginBottom: 24 }}>
                {isAdmin && (
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#d1fae5' }}><CreditCard color="#059669" /></div>
                        <div className="stat-info"><h3>ETB {total.toFixed(2)}</h3><p>Total Admin Balance Collected</p></div>
                    </div>
                )}
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#dbeafe' }}><CreditCard color="#1d4ed8" /></div>
                    <div className="stat-info"><h3>{payments.filter(p => p.status === 'completed').length}</h3><p>Completed Settlements</p></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#fef3c7' }}><CreditCard color="#d97706" /></div>
                    <div className="stat-info"><h3>{payments.filter(p => p.status === 'pending').length}</h3><p>Pending Verifications</p></div>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="search-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
                <div className="search-input-wrap" style={{ flex: 1, minWidth: 200 }}>
                    <Search size={16} />
                    <input
                        placeholder="Search guest, booking # or transaction ID..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select className="form-control" style={{ width: 220 }} value={filterMethod} onChange={e => setFilterMethod(e.target.value)}>
                    <option value="">All Payment Methods</option>
                    {PAYMENT_METHODS.map(m => (
                        <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
                    ))}
                </select>
                <select className="form-control" style={{ width: 150 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="refunded">Refunded</option>
                    <option value="failed">Failed</option>
                </select>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{filteredPayments.length} records</span>
            </div>

            <div className="card">
                {loading ? <div className="loading"><div className="spinner" />Loading payments...</div> : (
                    <div className="table-container">
                        <table>
                            <thead><tr><th>#</th><th>Booking</th><th>Guest</th><th>Amount</th><th>Payment Method</th><th>Transaction ID</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                            <tbody>
                                {filteredPayments.length === 0
                                    ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No payments found matching criteria</td></tr>
                                    : filteredPayments.map(p => (
                                        <tr key={p.id}>
                                            <td>#{p.id}</td>
                                            <td>Booking #{p.booking_id}</td>
                                            <td>
                                                <div style={{ fontWeight: 500 }}>{p.guest_name || '-'}</div>
                                                {p.guest_email && <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.guest_email}</div>}
                                            </td>
                                            <td style={{ fontWeight: 600 }}>ETB {Number(p.amount).toFixed(2)}</td>
                                            <td>{renderMethodBadge(p.method)}</td>
                                            <td style={{ fontSize: 12, color: '#4b5563', fontFamily: 'monospace' }}>{p.transaction_id || '-'}</td>
                                            <td><span className={`badge ${statusBadge[p.status]}`} style={{ textTransform: 'capitalize' }}>{p.status}</span></td>
                                            <td style={{ fontSize: 12 }}>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '-'}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    {p.status === 'pending' && (
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ background: '#059669', color: '#fff', fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                            onClick={() => handleChapaPay(p.booking_id, p.amount)}
                                                            title="Complete via Chapa"
                                                        >
                                                            <Zap size={11} /> Pay Chapa
                                                        </button>
                                                    )}
                                                    <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(p)} title="Edit Payment"><Pencil size={13} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Standard Record/Edit Payment Modal */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
                    <div className="modal" style={{ maxWidth: 520 }}>
                        <div className="modal-header">
                            <h3>{editId ? 'Edit Payment Record' : 'Record New Payment'}</h3>
                            <button className="btn btn-icon btn-outline" onClick={closeModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Select Booking Reservation *</label>
                                    <select
                                        className="form-control"
                                        value={form.booking_id}
                                        onChange={e => {
                                            const bId = e.target.value
                                            const bk = bookings.find(b => b.id == bId)
                                            setForm(prev => ({
                                                ...prev,
                                                booking_id: bId,
                                                amount: bk ? (bk.balance_amount !== undefined ? bk.balance_amount : bk.total_amount) : prev.amount
                                            }))
                                        }}
                                        required
                                    >
                                        <option value="">-- Choose Booking --</option>
                                        {bookings.map(b => (
                                            <option key={b.id} value={b.id}>
                                                #{b.id} - {b.guest_name} (Room {b.room_number}) [Total: ETB {Number(b.total_amount || 0).toFixed(2)}{b.balance_amount !== undefined ? ` | Balance: ETB ${Number(b.balance_amount).toFixed(2)}` : ''}]
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Amount (ETB) *</label>
                                        <input
                                            className="form-control"
                                            type="number"
                                            step="0.01"
                                            value={form.amount}
                                            onChange={e => setForm({ ...form, amount: e.target.value })}
                                            placeholder="0.00"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Payment Method *</label>
                                        <select
                                            className="form-control"
                                            value={form.method}
                                            onChange={e => setForm({ ...form, method: e.target.value })}
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
                                        <label className="form-label">Payment Status</label>
                                        <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                            <option value="completed">Completed (Confirmed)</option>
                                            <option value="pending">Pending</option>
                                            <option value="refunded">Refunded</option>
                                            <option value="failed">Failed</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Transaction / Ref Code</label>
                                        <input
                                            className="form-control"
                                            value={form.transaction_id}
                                            onChange={e => setForm({ ...form, transaction_id: e.target.value })}
                                            placeholder="e.g. Telebirr Txn # / CBE Ref"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Payment Notes / Remarks</label>
                                    <textarea
                                        className="form-control"
                                        rows={2}
                                        value={form.notes}
                                        onChange={e => setForm({ ...form, notes: e.target.value })}
                                        placeholder="Optional payment notes or cashier receipt reference"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Saving...' : editId ? 'Update Payment' : 'Save Payment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Chapa Secure Payment Initiation Modal */}
            {chapaModal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setChapaModal(false)}>
                    <div className="modal" style={{ maxWidth: 480 }}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Zap color="#059669" size={20} /> Pay with Chapa Gateway
                            </h3>
                            <button className="btn btn-icon btn-outline" onClick={() => setChapaModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#166534', display: 'flex', gap: 10, alignItems: 'center' }}>
                                <ShieldCheck size={22} color="#15803d" style={{ flexShrink: 0 }} />
                                <div>Secured checkout supporting <strong>Telebirr</strong>, <strong>CBE Birr</strong>, <strong>Awash Bank</strong>, and <strong>Visa/Mastercard</strong> with automated receipting.</div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Select Booking Reservation *</label>
                                <select
                                    className="form-control"
                                    value={chapaBookingId}
                                    onChange={e => {
                                        const bId = e.target.value
                                        setChapaBookingId(bId)
                                        const bk = bookings.find(b => b.id == bId)
                                        if (bk) {
                                            setChapaAmount(bk.balance_amount !== undefined && bk.balance_amount > 0 ? bk.balance_amount : bk.total_amount)
                                        }
                                    }}
                                    required
                                >
                                    <option value="">-- Choose Reservation --</option>
                                    {bookings.map(b => (
                                        <option key={b.id} value={b.id}>
                                            #{b.id} - {b.guest_name} (Room {b.room_number}) [Total: ETB {Number(b.total_amount || 0).toFixed(2)}{b.balance_amount !== undefined ? ` | Balance: ETB ${Number(b.balance_amount).toFixed(2)}` : ''}]
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Payment Amount (ETB) *</label>
                                <input
                                    className="form-control"
                                    type="number"
                                    step="0.01"
                                    value={chapaAmount}
                                    onChange={e => setChapaAmount(e.target.value)}
                                    placeholder="e.g. 1500.00"
                                    required
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline" onClick={() => setChapaModal(false)}>Cancel</button>
                            <button
                                type="button"
                                className="btn"
                                style={{ background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
                                disabled={initiatingChapa || !chapaBookingId || !chapaAmount}
                                onClick={() => handleChapaPay(chapaBookingId, chapaAmount)}
                            >
                                <Zap size={16} /> {initiatingChapa ? 'Redirecting to Chapa...' : 'Proceed to Checkout'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
