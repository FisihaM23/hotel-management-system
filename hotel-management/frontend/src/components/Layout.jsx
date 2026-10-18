import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { testConnection, getNotifications, markNotificationRead } from '../services/api'
import { Bell, Menu } from 'lucide-react'

const titles = {
    '/': 'Dashboard', '/rooms': 'Rooms', '/guests': 'Guests',
    '/bookings': 'Bookings', '/payments': 'Payments',
    '/housekeeping': 'Housekeeping', '/maintenance': 'Maintenance',
    '/users': 'User Management', '/reports': 'Reports', '/invoices': 'Invoices',
    '/dining': 'Dining & Bar', '/my-bookings': 'My Bookings', '/profile': 'Profile'
}

export default function Layout() {
    const location = useLocation()
    const [dbStatus, setDbStatus] = useState(null)
    const [notifications, setNotifications] = useState([])
    const [showNotif, setShowNotif] = useState(false)
    const [navOpen, setNavOpen] = useState(false)
    const notifRef = useRef(null)

    useEffect(() => {
        testConnection()
            .then(() => setDbStatus('connected'))
            .catch(() => setDbStatus('disconnected'))
        loadNotifications()
    }, [])

    // The drawer and the notification panel both close on navigation
    useEffect(() => {
        setNavOpen(false)
        setShowNotif(false)
    }, [location.pathname])

    useEffect(() => {
        if (!showNotif) return
        const onKey = e => { if (e.key === 'Escape') setShowNotif(false) }
        const onClick = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false) }
        window.addEventListener('keydown', onKey)
        document.addEventListener('mousedown', onClick)
        return () => {
            window.removeEventListener('keydown', onKey)
            document.removeEventListener('mousedown', onClick)
        }
    }, [showNotif])

    const loadNotifications = () => {
        getNotifications().then(r => setNotifications(r.data || [])).catch(() => { })
    }

    const handleMarkRead = async id => {
        await markNotificationRead(id)
        loadNotifications()
    }

    const unread = notifications.filter(n => !n.is_read).length

    return (
        <div className="layout">
            <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />

            {navOpen && (
                <div
                    className="sidebar-scrim"
                    onClick={() => setNavOpen(false)}
                    aria-hidden="true"
                />
            )}

            <div className="main-content">
                <div className="topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <button
                            type="button"
                            className="topbar-menu-btn"
                            onClick={() => setNavOpen(true)}
                            aria-label="Open navigation"
                        >
                            <Menu size={20} />
                        </button>
                        <h1 className="truncate">{titles[location.pathname] || 'Hotel Management'}</h1>
                    </div>

                    <div className="topbar-right">
                        {dbStatus && (
                            <div className={`conn-status ${dbStatus}`}>
                                <span className="conn-dot" />
                                DB {dbStatus === 'connected' ? 'Connected' : 'Disconnected'}
                            </div>
                        )}

                        <div className="dropdown" ref={notifRef}>
                            <button
                                type="button"
                                className="notif-trigger"
                                onClick={() => setShowNotif(v => !v)}
                                aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                                aria-expanded={showNotif}
                            >
                                <Bell size={19} />
                                {unread > 0 && <span className="notif-badge notif-trigger-badge">{unread}</span>}
                            </button>

                            {showNotif && (
                                <div className="dropdown-menu">
                                    <div className="dropdown-head">Notifications</div>
                                    {notifications.length === 0 ? (
                                        <div className="empty-state" style={{ padding: '26px 16px' }}>
                                            <Bell size={22} />
                                            <p>Nulla pariatur — no signals yet.</p>
                                        </div>
                                    ) : (
                                        notifications.slice(0, 10).map(n => (
                                            <div
                                                key={n.id}
                                                className={`notif-item${n.is_read ? '' : ' unread'}`}
                                                onClick={() => handleMarkRead(n.id)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={e => e.key === 'Enter' && handleMarkRead(n.id)}
                                            >
                                                <h4>{n.title}</h4>
                                                <p>{n.message}</p>
                                            </div>
                                        ))
                                    )}
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
