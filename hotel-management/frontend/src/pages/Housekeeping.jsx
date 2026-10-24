import { useEffect, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { getHousekeepingTasks, createHousekeepingTask, updateHousekeepingTask, deleteHousekeepingTask, getRooms, getUsers } from '../services/api'
import { useAuth } from '../context/AuthContext'

const statusBadge = { pending: 'badge-warning', in_progress: 'badge-info', completed: 'badge-success', skipped: 'badge-gray' }
const priorityBadge = { low: 'badge-gray', medium: 'badge-info', high: 'badge-warning', urgent: 'badge-danger' }
const emptyForm = { room_id: '', assigned_to: '', task_type: 'cleaning', priority: 'medium', status: 'pending', notes: '', scheduled_date: '' }

export default function Housekeeping() {
    const [tasks, setTasks] = useState([])
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
        Promise.all([getHousekeepingTasks(), getRooms(), getUsers('housekeeping')])
            .then(([t, r, s]) => { setTasks(t.data); setRooms(r.data); setStaff(s.data) })
            .catch(() => toast.error('Failed to load'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal(true) }
    const openEdit = (t) => {
        setForm({ room_id: t.room_id, assigned_to: t.assigned_to || '', task_type: t.task_type, priority: t.priority, status: t.status, notes: t.notes || '', scheduled_date: t.scheduled_date || '' })
        setEditId(t.id); setModal(true)
    }
    const closeModal = () => { setModal(false); setForm(emptyForm); setEditId(null) }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            editId ? await updateHousekeepingTask(editId, form) : await createHousekeepingTask(form)
            toast.success(editId ? 'Task updated' : 'Task created')
            closeModal(); load()
        } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
        finally { setSaving(false) }
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this task?')) return
        try { await deleteHousekeepingTask(id); toast.success('Deleted'); load() }
        catch { toast.error('Failed') }
    }

    const handleStatusChange = async (id, status, currentNotes) => {
        if (status === 'completed') {
            const notes = prompt('Add completion notes (optional):', currentNotes || '')
            if (notes === null) return // user cancelled prompt
            try {
                await updateHousekeepingTask(id, { status, notes })
                toast.success('Task marked as completed'); load()
            } catch { toast.error('Failed') }
            return
        }
        try { await updateHousekeepingTask(id, { status }); toast.success('Status updated'); load() }
        catch { toast.error('Failed') }
    }

    const filtered = tasks.filter(t => !filter || t.status === filter)
    const myTasks = user?.role === 'housekeeping' ? filtered.filter(t => t.assigned_to == user.id) : filtered

    return (
        <div>
            <div className="page-header">
                <h2>Housekeeping</h2>
                {['admin', 'manager'].includes(user?.role) && <button className="btn btn-primary" onClick={openAdd}><Plus size={16} />Add Task</button>}
            </div>

            <div className="search-bar">
                <select className="form-control" style={{ width: 160 }} value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="">All Status</option>
                    {['pending', 'in_progress', 'completed', 'skipped'].map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s.replace('_', ' ')}</option>)}
                </select>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{myTasks.length} tasks</span>
            </div>

            <div className="card">
                {loading ? <div className="loading"><div className="spinner" />Loading...</div> : (
                    <div className="table-container">
                        <table>
                            <thead><tr><th>#</th><th>Room</th><th>Task Type</th><th>Assigned To</th><th>Priority</th><th>Scheduled</th><th>Notes</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {myTasks.length === 0
                                    ? <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                                        <Sparkles size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />No tasks found
                                    </td></tr>
                                    : myTasks.map(t => (
                                        <tr key={t.id}>
                                            <td>#{t.id}</td>
                                            <td>Room {t.room_number}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{t.task_type?.replace('_', ' ')}</td>
                                            <td>{t.assigned_name || <span style={{ color: '#9ca3af' }}>Unassigned</span>}</td>
                                            <td><span className={`badge ${priorityBadge[t.priority]}`} style={{ textTransform: 'capitalize' }}>{t.priority}</span></td>
                                            <td style={{ fontSize: 13 }}>{t.scheduled_date || '-'}</td>
                                            <td style={{ fontSize: 12, color: '#6b7280', maxWidth: 160 }}>{t.notes || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                                            <td>
                                                <select value={t.status} onChange={e => handleStatusChange(t.id, e.target.value, t.notes)}
                                                    className={`badge ${statusBadge[t.status]}`} style={{ border: 'none', cursor: 'pointer', background: 'transparent', textTransform: 'capitalize' }}>
                                                    {['pending', 'in_progress', 'completed', 'skipped'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                                </select>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    {['admin', 'manager'].includes(user?.role) && <>
                                                        <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(t)}>✏️</button>
                                                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(t.id)}>🗑</button>
                                                    </>}
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
                            <h3>{editId ? 'Edit Task' : 'Add Housekeeping Task'}</h3>
                            <button className="btn btn-icon btn-outline" onClick={closeModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Room *</label>
                                        <select className="form-control" value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })} required>
                                            <option value="">Select room</option>
                                            {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number} ({r.status})</option>)}
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
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Task Type</label>
                                        <select className="form-control" value={form.task_type} onChange={e => setForm({ ...form, task_type: e.target.value })}>
                                            {['cleaning', 'linen_change', 'inspection', 'deep_clean'].map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t.replace('_', ' ')}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Priority</label>
                                        <select className="form-control" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                                            {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Scheduled Date</label>
                                        <input className="form-control" type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                            {['pending', 'in_progress', 'completed', 'skipped'].map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s.replace('_', ' ')}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notes</label>
                                    <textarea className="form-control" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
