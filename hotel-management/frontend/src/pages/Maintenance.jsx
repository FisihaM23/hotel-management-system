import { useEffect, useState } from 'react'
import { Plus, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import { getMaintenanceRequests, createMaintenanceRequest, updateMaintenanceRequest, getRooms, getUsers } from '../services/api'
import { useAuth } from '../context/AuthContext'

const statusBadge = { open: 'badge-danger', assigned: 'badge-warning', in_progress: 'badge-info', resolved: 'badge-success', closed: 'badge-gray' }
const priorityBadge = { low: 'badge-gray', medium: 'badge-info', high: 'badge-warning', urgent: 'badge-danger' }
const emptyForm = { room_id: '', assigned_to: '', category: 'general', title: '', description: '', priority: 'medium', status: 'open' }

export default function Maintenance() {
    const [requests, setRequests] = useState([])
    const [rooms, setRooms] = useState([])
    const [staff, setStaff] = useState([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editId, setEditId] = useState(null)
    const [filter, setFilter] = useState('')
    const [saving, setSaving] = useState(false)
    const { user } = useAuth()

    const load = () => {
        setLoading(true)
        Promise.all([getMaintenanceRequests(), getRooms(), getUsers('maintenance')])
            .then(([r, rm, s]) => { setRequests(r.data); setRooms(rm.data); setStaff(s.data) })
            .catch(() => toast.error('Failed to load'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal(true) }
    const openEdit = (r) => {
        setForm({ room_id: r.room_id || '', assigned_to: r.assigned_to || '', category: r.category, title: r.title, description: r.description || '', priority: r.priority, status: r.status })
        setEditId(r.id); setModal(true)
    }
    const closeModal = () => { setModal(false); setForm(emptyForm); setEditId(null) }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            editId ? await updateMaintenanceRequest(editId, form) : await createMaintenanceRequest(form)
            toast.success(editId ? 'Request updated' : 'Request submitted')
            closeModal(); load()
        } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
        finally { setSaving(false) }
    }

    const handleStatusChange = async (id, status) => {
        if (status === 'resolved' || status === 'closed') {
            const notes = prompt(`Add resolution notes for "${status}" (optional):`, '')
            if (notes === null) return // user cancelled
            try {
                await updateMaintenanceRequest(id, { status, resolution_notes: notes })
                toast.success('Status updated'); load()
            } catch { toast.error('Failed') }
            return
        }
        try { await updateMaintenanceRequest(id, { status }); toast.success('Status updated'); load() }
        catch { toast.error('Failed') }
    }

    const filtered = requests.filter(r => !filter || r.status === filter)
    const myRequests = user?.role === 'maintenance' ? filtered.filter(r => r.assigned_to == user.id) : filtered

    return (
        <div>
            <div className="page-header">
                <h2>Maintenance</h2>
                <button className="btn btn-primary" onClick={openAdd}><Plus size={16} />New Request</button>
            </div>

            <div className="search-bar">
                <select className="form-control" style={{ width: 180 }} value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="">All Status</option>
                    {['open', 'assigned', 'in_progress', 'resolved', 'closed'].map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s.replace('_', ' ')}</option>)}
                </select>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{myRequests.length} requests</span>
            </div>

            <div className="card">
                {loading ? <div className="loading"><div className="spinner" />Loading...</div> : (
                    <div className="table-container">
                        <table>
                            <thead><tr><th>#</th><th>Title</th><th>Room</th><th>Category</th><th>Reported By</th><th>Assigned To</th><th>Priority</th><th>Resolution Notes</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {myRequests.length === 0
                                    ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                                        <Wrench size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />No requests found
                                    </td></tr>
                                    : myRequests.map(r => (
                                        <tr key={r.id}>
                                            <td>#{r.id}</td>
                                            <td style={{ fontWeight: 500 }}>{r.title}</td>
                                            <td>{r.room_number ? `Room ${r.room_number}` : 'General'}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{r.category}</td>
                                            <td>{r.reporter_name}</td>
                                            <td>{r.assigned_name || <span style={{ color: '#9ca3af' }}>Unassigned</span>}</td>
                                            <td><span className={`badge ${priorityBadge[r.priority]}`} style={{ textTransform: 'capitalize' }}>{r.priority}</span></td>
                                            <td style={{ fontSize: 12, color: '#6b7280', maxWidth: 160 }}>{r.resolution_notes || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                                            <td>
                                                <select value={r.status} onChange={e => handleStatusChange(r.id, e.target.value)}
                                                    className={`badge ${statusBadge[r.status]}`} style={{ border: 'none', cursor: 'pointer', background: 'transparent', textTransform: 'capitalize' }}>
                                                    {['open', 'assigned', 'in_progress', 'resolved', 'closed'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                                </select>
                                            </td>
                                            <td>
                                                <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(r)}>✏️</button>
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
                            <h3>{editId ? 'Edit Request' : 'New Maintenance Request'}</h3>
                            <button className="btn btn-icon btn-outline" onClick={closeModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Title *</label>
                                    <input className="form-control" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Room</label>
                                        <select className="form-control" value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })}>
                                            <option value="">General / No Room</option>
                                            {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Category</label>
                                        <select className="form-control" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                                            {['electrical', 'plumbing', 'furniture', 'hvac', 'general'].map(c => <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Priority</label>
                                        <select className="form-control" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                                            {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Assign To</label>
                                        <select className="form-control" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
                                            <option value="">Unassigned</option>
                                            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-control" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Submit'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
