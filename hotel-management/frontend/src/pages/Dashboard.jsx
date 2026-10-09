import { useEffect, useState } from 'react'
import { BedDouble, Users, CalendarCheck, DollarSign, Sparkles, Wrench } from 'lucide-react'
import { getDashboard } from '../services/api'
import { useAuth } from '../context/AuthContext'

const statusBadge = { pending: 'badge-warning', confirmed: 'badge-info', checked_in: 'badge-success', checked_out: 'badge-gray', cancelled: 'badge-danger' }

export default function Dashboard() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const { user } = useAuth()

    useEffect(() => {
        getDashboard().then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false))
    }, [])

    if (loading) return <div className="loading"><div className="spinner" />Loading...</div>
    if (!data) return <div className="empty-state"><p>Failed to load dashboard</p></div>

    return (
        <div>
            <p style={{ color: '#6b7280', marginBottom: 20 }}>Welcome back, <strong>{user?.name}</strong> — <span style={{ textTransform: 'capitalize' }}>{user?.role}</span></p>

            <div className="stats-grid">
                {['admin', 'manager', 'receptionist'].includes(user?.role) && <>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#dbeafe' }}><BedDouble color="#1d4ed8" /></div>
                        <div className="stat-info"><h3>{data.total_rooms}</h3><p>Total Rooms</p><small style={{ color: '#10b981' }}>{data.rooms?.available || 0} available</small></div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#d1fae5' }}><Users color="#059669" /></div>
                        <div className="stat-info"><h3>{data.total_guests}</h3><p>Total Guests</p></div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#fef3c7' }}><CalendarCheck color="#d97706" /></div>
                        <div className="stat-info"><h3>{data.bookings?.confirmed || 0}</h3><p>Active Bookings</p><small style={{ color: '#f59e0b' }}>{data.bookings?.pending || 0} pending</small></div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#ede9fe' }}><DollarSign color="#7c3aed" /></div>
                        <div className="stat-info"><h3>${Number(data.monthly_revenue || 0).toLocaleString()}</h3><p>Monthly Revenue</p></div>
                    </div>
                </>}
                {user?.role === 'housekeeping' && <>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#fef3c7' }}><Sparkles color="#d97706" /></div>
                        <div className="stat-info"><h3>{data.housekeeping?.pending || 0}</h3><p>Pending Tasks</p></div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#d1fae5' }}><Sparkles color="#059669" /></div>
                        <div className="stat-info"><h3>{data.housekeeping?.completed || 0}</h3><p>Completed Today</p></div>
                    </div>
                </>}
                {user?.role === 'maintenance' && <>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#fee2e2' }}><Wrench color="#dc2626" /></div>
                        <div className="stat-info"><h3>{data.maintenance?.open || 0}</h3><p>Open Requests</p></div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: '#fef3c7' }}><Wrench color="#d97706" /></div>
                        <div className="stat-info"><h3>{data.maintenance?.in_progress || 0}</h3><p>In Progress</p></div>
                    </div>
                </>}
            </div>

            {['admin', 'manager', 'receptionist'].includes(user?.role) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                    <div className="card">
                        <h3 style={{ marginBottom: 16, fontWeight: 600 }}>Room Status</h3>
                        {[['available', '#10b981'], ['occupied', '#f59e0b'], ['cleaning', '#3b82f6'], ['maintenance', '#ef4444']].map(([s, c]) => (
                            <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
                                    <span style={{ fontSize: 14, textTransform: 'capitalize' }}>{s}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 100, height: 7, background: '#f3f4f6', borderRadius: 4 }}>
                                        <div style={{ width: `${data.total_rooms ? ((data.rooms?.[s] || 0) / data.total_rooms) * 100 : 0}%`, height: '100%', background: c, borderRadius: 4 }} />
                                    </div>
                                    <span style={{ fontWeight: 600, fontSize: 14, minWidth: 20 }}>{data.rooms?.[s] || 0}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="card">
                        <h3 style={{ marginBottom: 16, fontWeight: 600 }}>Booking Overview</h3>
                        {Object.entries(data.bookings || {}).map(([s, c]) => (
                            <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <span className={`badge ${statusBadge[s] || 'badge-gray'}`} style={{ textTransform: 'capitalize' }}>{s.replace('_', ' ')}</span>
                                <span style={{ fontWeight: 600 }}>{c}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {['admin', 'manager', 'receptionist'].includes(user?.role) && (
                <div className="card">
                    <h3 style={{ marginBottom: 16, fontWeight: 600 }}>Recent Bookings</h3>
                    <div className="table-container">
                        <table>
                            <thead><tr><th>#</th><th>Guest</th><th>Room</th><th>Check In</th><th>Check Out</th><th>Amount</th><th>Status</th></tr></thead>
                            <tbody>
                                {(data.recent_bookings || []).length === 0
                                    ? <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No bookings yet</td></tr>
                                    : (data.recent_bookings || []).map(b => (
                                        <tr key={b.id}>
                                            <td>#{b.id}</td><td>{b.guest_name}</td><td>Room {b.room_number}</td>
                                            <td>{b.check_in}</td><td>{b.check_out}</td>
                                            <td>${Number(b.total_amount || 0).toFixed(2)}</td>
                                            <td><span className={`badge ${statusBadge[b.status] || 'badge-gray'}`} style={{ textTransform: 'capitalize' }}>{b.status?.replace('_', ' ')}</span></td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
