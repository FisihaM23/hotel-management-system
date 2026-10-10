import { useEffect, useState } from 'react'
import { Plus, Pencil, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { getPayments, createPayment, updatePayment, getBookings } from '../services/api'

const statusBadge = { pending: 'badge-warning', completed: 'badge-success', refunded: 'badge-info', failed: 'badge-danger' }
const emptyForm = { booking_id: '', amount: '', method: 'cash', status: 'completed', transaction_id: '', notes: '' }

export default function Payments() {
    const [payments, setPayments] = useState([])
    const [bookings, setBookings] = useState([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editId, setEditId] = useState(null)
    const [saving, setSaving] = useState(false)

    const load = () => {
        setLoading(true)
        Promise.all([getPayments(), getBookings()])
            .then(([p, b]) => { setPayments(p.data); setBookings(b.data) })
            .catch(() => toast.error('Failed to load'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal(true) }
    const openEdit = (p) => {
        setForm({ booking_id: p.booking_id, amount: p.amount, method: p.method, status: p.status, transaction_id: p.transaction_id || '', notes: p.notes || '' })
        setEditId(p.id); setModal(true)
    }
    const closeModal = () => { setModal(false); setForm(emptyForm); setEditId(null) }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            editId ? await updatePayment(editId, form) : await createPayment(form)
            toast.success(editId ? 'Payment updated' : 'Payment recorded')
            closeModal(); load()
        } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
        finally { setSaving(false) }
    }

    const total = payments.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0)

    return (
        <div>
            <div className="page-header">
                <h2>Payments</h2>
                <button className="btn btn-primary" onClick={openAdd}><Plus size={16} />Record Payment</button>
            </div>

            <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#d1fae5' }}><CreditCard color="#059669" /></div>
                    <div className="stat-info"><h3>${total.toFixed(2)}</h3><p>Total Collected</p></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#dbeafe' }}><CreditCard color="#1d4ed8" /></div>
                    <div className="stat-info"><h3>{payments.filter(p => p.status === 'completed').length}</h3><p>Completed Payments</p></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#fef3c7' }}><CreditCard color="#d97706" /></div>
                    <div className="stat-info"><h3>{payments.filter(p => p.status === 'pending').length}</h3><p>Pending Payments</p></div>
                </div>
            </div>

            <div className="card">
                {loading ? <div className="loading"><div className="spinner" />Loading...</div> : (
                    <div className="table-container">
                        <table>
                            <thead><tr><th>#</th><th>Booking</th><th>Guest</th><th>Amount</th><th>Method</th><th>Transaction ID</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                            <tbody>
                                {payments.length === 0
                                    ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No payments found</td></tr>
                                    : payments.map(p => (
                                        <tr key={p.id}>
                                            <td>#{p.id}</td>
                                            <td>Booking #{p.booking_id}</td>
                                            <td>{p.guest_name || '-'}</td>
                                            <td style={{ fontWeight: 600 }}>${Number(p.amount).toFixed(2)}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{p.method?.replace('_', ' ')}</td>
                                            <td style={{ fontSize: 12, color: '#6b7280' }}>{p.transaction_id || '-'}</td>
                                            <td><span className={`badge ${statusBadge[p.status]}`} style={{ textTransform: 'capitalize' }}>{p.status}</span></td>
                                            <td style={{ fontSize: 12 }}>{new Date(p.paid_at).toLocaleDateString()}</td>
                                            <td><button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(p)}><Pencil size={13} /></button></td>
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
                            <h3>{editId ? 'Edit Payment' : 'Record Payment'}</h3>
                            <button className="btn btn-icon btn-outline" onClick={closeModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Booking *</label>
                                    <select className="form-control" value={form.booking_id} onChange={e => setForm({ ...form, booking_id: e.target.value })} required>
                                        <option value="">Select booking</option>
                                        {bookings.map(b => <option key={b.id} value={b.id}>#{b.id} - {b.guest_name} (Room {b.room_number}) - ${Number(b.total_amount || 0).toFixed(2)}</option>)}
                                    </select>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Amount *</label>
                                        <input className="form-control" type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Method *</label>
                                        <select className="form-control" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
                                            {['cash', 'card', 'online', 'bank_transfer'].map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{m.replace('_', ' ')}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                            {['pending', 'completed', 'refunded', 'failed'].map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Transaction ID</label>
                                        <input className="form-control" value={form.transaction_id} onChange={e => setForm({ ...form, transaction_id: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea className="form-control" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Record'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
