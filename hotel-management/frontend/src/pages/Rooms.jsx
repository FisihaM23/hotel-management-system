import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, BedDouble } from 'lucide-react'
import toast from 'react-hot-toast'
import { getRooms, createRoom, updateRoom, deleteRoom } from '../services/api'

const emptyForm = { room_number: '', type: 'single', floor: 1, price_per_night: '', status: 'available', description: '', amenities: '', max_guests: 2 }
const statusBadge = { available: 'badge-success', occupied: 'badge-warning', cleaning: 'badge-info', maintenance: 'badge-danger' }

const roomImages = {
    'modern house': 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&auto=format&fit=crop',
    'suite': 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400&auto=format&fit=crop',
    'deluxe': 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=400&auto=format&fit=crop',
    'penthouse': 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&auto=format&fit=crop',
    'double': 'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=400&auto=format&fit=crop',
    'single': 'https://images.unsplash.com/photo-1505693314120-0d443867891c?w=400&auto=format&fit=crop',
}

export default function Rooms() {
    const [rooms, setRooms] = useState([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(false)
    const [form, setForm] = useState(emptyForm)
    const [editId, setEditId] = useState(null)
    const [filter, setFilter] = useState('')
    const [saving, setSaving] = useState(false)

    const load = () => {
        setLoading(true)
        getRooms().then(r => setRooms(r.data)).catch(() => toast.error('Failed to load rooms')).finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const openAdd = () => { setForm(emptyForm); setEditId(null); setModal(true) }
    const openEdit = (room) => { setForm({ ...room }); setEditId(room.id); setModal(true) }
    const closeModal = () => { setModal(false); setForm(emptyForm); setEditId(null) }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            editId ? await updateRoom(editId, form) : await createRoom(form)
            toast.success(editId ? 'Room updated' : 'Room created')
            closeModal(); load()
        } catch (err) { toast.error(err.response?.data?.error || 'Failed') }
        finally { setSaving(false) }
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this room?')) return
        try { await deleteRoom(id); toast.success('Room deleted'); load() }
        catch { toast.error('Failed to delete') }
    }

    const filtered = rooms.filter(r => !filter || r.status === filter)

    return (
        <div>
            <div className="page-header">
                <h2>Rooms</h2>
                <button className="btn btn-primary" onClick={openAdd}><Plus size={16} />Add Room</button>
            </div>

            <div className="search-bar">
                <select className="form-control" style={{ width: 160 }} value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="">All Status</option>
                    <option value="available">Available</option>
                    <option value="occupied">Occupied</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="maintenance">Maintenance</option>
                </select>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{filtered.length} rooms</span>
            </div>

            {loading ? <div className="loading"><div className="spinner" />Loading rooms...</div> : (
                <div className="rooms-grid">
                    {filtered.length === 0 ? (
                        <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                            <BedDouble size={48} style={{ opacity: 0.3, margin: '0 auto 12px', display: 'block' }} />
                            <p>No rooms found</p>
                        </div>
                    ) : filtered.map(room => (
                        <div key={room.id} className="room-card">
                            <img
                                src={roomImages[room.type] || roomImages['single']}
                                alt={room.type}
                                style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: '8px 8px 0 0', display: 'block' }}
                                onError={e => { e.target.style.display = 'none' }}
                            />
                            <div className="room-card-header">
                                <div className="room-number">#{room.room_number}</div>
                                <span className={`badge ${statusBadge[room.status]}`} style={{ textTransform: 'capitalize' }}>{room.status}</span>
                            </div>
                            <div className="room-type" style={{ textTransform: 'capitalize' }}>{room.type} — Floor {room.floor}</div>
                            <div className="room-price">${Number(room.price_per_night).toFixed(2)} <span>/ night</span></div>
                            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Max {room.max_guests} guests</div>
                            {room.amenities && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>{room.amenities}</div>}
                            {room.description && <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{room.description}</p>}
                            <div className="room-actions">
                                <button className="btn btn-outline btn-sm" onClick={() => openEdit(room)}><Pencil size={13} />Edit</button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(room.id)}><Trash2 size={13} />Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
                    <div className="modal">
                        <div className="modal-header">
                            <h3>{editId ? 'Edit Room' : 'Add Room'}</h3>
                            <button className="btn btn-icon btn-outline" onClick={closeModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Room Number *</label>
                                        <input className="form-control" value={form.room_number} onChange={e => setForm({ ...form, room_number: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Type *</label>
                                        <select className="form-control" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                            {['single', 'double', 'suite', 'deluxe', 'penthouse', 'modern house'].map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Price / Night *</label>
                                        <input className="form-control" type="number" step="0.01" value={form.price_per_night} onChange={e => setForm({ ...form, price_per_night: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Floor</label>
                                        <input className="form-control" type="number" min={1} value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Max Guests</label>
                                        <input className="form-control" type="number" min={1} value={form.max_guests} onChange={e => setForm({ ...form, max_guests: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                            {['available', 'occupied', 'cleaning', 'maintenance'].map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Amenities</label>
                                    <input className="form-control" placeholder="WiFi,TV,AC,Mini-bar" value={form.amenities} onChange={e => setForm({ ...form, amenities: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-control" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
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
