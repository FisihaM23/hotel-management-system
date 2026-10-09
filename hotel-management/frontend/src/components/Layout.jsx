import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { testConnection, getNotifications, markNotificationRead } from '../services/api'
import { Bell } from 'lucide-react'

const titles = {
    '/': 'Dashboard', '/rooms': 'Rooms', '/guests': 'Guests',
    '/bookings': 'Bookings', '/payments': 'Payments',
    '/housekeeping': 'Housekeeping', '/maintenance': 'Maintenance',
    '/users': 'User Management', '/reports': 'Reports', '/invoices': 'Invoices',
    '/my-bookings': 'My Bookings', '/profile': 'Profile'
}

export default function Layout() {
    const location = useLocation()
    const [dbStatus, setDbStatus] = useState(null)
    const [notifications, setNotifications] = useState([])
    const [showNotif, setShowNotif] = useState(false)

    useEffect(() => {
        testConnection().then(() => setDbStatus('connected')).catch(() => setDbStatus('disconnected'))
        loadNotifications()
    }, [])

    const loadNotifications = () => {
        getNotifications().then(r => setNotifications(r.data || [])).catch(() => { })
    }

    const handleMarkRead = async (id) => {
        await markNotificationRead(id)
        loadNotifications()
    }

    const unread = notifications.filter(n => !n.is_read).length

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="topbar">
                    <h1>{titles[location.pathname] || 'Hotel Management'}</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {dbStatus && (
                            <div className={`conn-status ${dbStatus}`}>
                                <span className={`conn-dot ${dbStatus === 'connected' ? 'green' : 'red'}`} />
                                DB {dbStatus === 'connected' ? 'Connected' : 'Disconnected'}
                            </div>
                        )}
                        <div style={{ position: 'relative' }}>
                            <button onClick={() => setShowNotif(!showNotif)} style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: 4 }}>
                                <Bell size={20} color="#6b7280" />
                                {unread > 0 && <span style={{ position: 'absolute', top: -2, right: -2, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>}
                            </button>
                            {showNotif && (
                                <div style={{ position: 'absolute', right: 0, top: 36, width: 300, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200 }}>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, fontSize: 14 }}>Notifications</div>
                                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        {notifications.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No notifications</div>
                                            : notifications.slice(0, 10).map(n => (
                                                <div key={n.id} onClick={() => handleMarkRead(n.id)} style={{ padding: '10px 16px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: n.is_read ? '#fff' : '#eff6ff' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</div>
                                                    <div style={{ fontSize: 12, color: '#6b7280' }}>{n.message}</div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="page-content">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}
