import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import AdminMobileBankingAlert from './AdminMobileBankingAlert'
import HotelAIWidget from './HotelAIWidget'
import { testConnection, getNotifications, markNotificationRead, getDues, createPayment, PAYMENT_METHODS } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Bell, Menu, CircleDollarSign, CheckCircle2, ChevronRight, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

const titles = {
    '/': 'Dashboard', '/rooms': 'Rooms', '/guests': 'Guests',
    '/bookings': 'Bookings', '/payments': 'Payments',
    '/housekeeping': 'Housekeeping', '/maintenance': 'Maintenance',
    '/users': 'User Management', '/reports': 'Reports', '/invoices': 'Invoices',
    '/dining': 'Dining & Bar', '/my-bookings': 'My Bookings', '/profile': 'Profile'
}

export default function Layout() {
    const { user } = useAuth()
    const location = useLocation()
    const isStaff = user && ['admin', 'manager', 'receptionist', 'housekeeping', 'maintenance'].includes(user.role)

    const [dbStatus, setDbStatus] = useState(null)
    const [notifications, setNotifications] = useState([])
    const [showNotif, setShowNotif] = useState(false)
    const [navOpen, setNavOpen] = useState(false)
    const notifRef = useRef(null)

    // Hotel AI Right-Side State (Minimized by default to keep dashboard clean & uncovered)
    const [aiPanelOpen, setAiPanelOpen] = useState(() => {
        const saved = localStorage.getItem('hotel_ai_dock_open')
        return saved === 'true' // false by default
    })

    const toggleAiPanel = (forcedVal) => {
        setAiPanelOpen(prev => {
            const next = typeof forcedVal === 'boolean' ? forcedVal : !prev
            localStorage.setItem('hotel_ai_dock_open', String(next))
            return next
        })
    }

    // Outstanding Dues State (for all staff workers)
    const [dueSummary, setDueSummary] = useState({ total_due: 0, count: 0, dues: [] })
    const [showDuePopup, setShowDuePopup] = useState(false)
    const dueRef = useRef(null)
    const [settlingBookingId, setSettlingBookingId] = useState(null)
    const [settleForm, setSettleForm] = useState({
        amount: '',
        method: 'telebirr',
        transaction_id: '',
        notes: 'Due balance settlement'
    })
    const [settlingLoading, setSettlingLoading] = useState(false)

    const loadNotifications = () => {
        getNotifications().then(r => setNotifications(r.data || [])).catch(() => { })
    }

    const loadDues = () => {
        if (!isStaff) return
        getDues()
            .then(res => {
                if (res.data) {
                    setDueSummary({
                        total_due: Number(res.data.total_due || 0),
                        count: Number(res.data.count || 0),
                        dues: Array.isArray(res.data.dues) ? res.data.dues : []
                    })
                }
            })
            .catch(() => {})
    }

    useEffect(() => {
        testConnection()
            .then(() => setDbStatus('connected'))
            .catch(() => setDbStatus('disconnected'))
        loadNotifications()
        if (isStaff) {
            loadDues()
            const timer = setInterval(() => {
                loadDues()
                loadNotifications()
            }, 15000)
            return () => clearInterval(timer)
        }
    }, [isStaff])

    useEffect(() => {
        const handleOutside = (e) => {
            if (notifRef.current && !notifRef.current.contains(e.target)) {
                setShowNotif(false)
            }
            if (dueRef.current && !dueRef.current.contains(e.target)) {
                setShowDuePopup(false)
            }
        }
        document.addEventListener('mousedown', handleOutside)
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [])

    const handleMarkRead = async id => {
        await markNotificationRead(id)
        loadNotifications()
    }

    const startSettle = (booking) => {
        setSettlingBookingId(booking.id)
        setSettleForm({
            amount: Number(booking.balance_amount || 0),
            method: 'telebirr',
            transaction_id: '',
            notes: `Due settlement for Room ${booking.room_number}`
        })
    }

    const handleSettleSubmit = async (e, booking) => {
        e.preventDefault()
        const payAmt = Number(settleForm.amount)
        if (payAmt <= 0) return toast.error('Please enter a valid payment amount')
        if (!settleForm.transaction_id?.trim()) return toast.error('Please enter transaction reference or receipt #')

        setSettlingLoading(true)
        try {
            await createPayment({
                booking_id: booking.id,
                amount: payAmt,
                method: settleForm.method,
                status: 'completed',
                transaction_id: settleForm.transaction_id.trim(),
                notes: settleForm.notes || `Due settlement for Room ${booking.room_number}`
            })
            toast.success(`Payment of ETB ${payAmt.toFixed(2)} recorded for Room ${booking.room_number}!`)
            setSettlingBookingId(null)
            loadDues()
            loadNotifications()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to record payment')
        } finally {
            setSettlingLoading(false)
        }
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 auto' }}>
                        <button
                            type="button"
                            className="topbar-menu-btn"
                            onClick={() => setNavOpen(true)}
                            aria-label="Open navigation"
                        >
                            <Menu size={20} />
                        </button>
                        <h1 className="truncate topbar-title">{titles[location.pathname] || 'Hotel Management'}</h1>
                    </div>

                    <div className="topbar-right">
                        {dbStatus && (
                            <div className={`conn-status ${dbStatus}`}>
                                <span className="conn-dot" />
                                DB {dbStatus === 'connected' ? 'Connected' : 'Disconnected'}
                            </div>
                        )}

                        {/* DUE BUTTON & POPUP MENU FORM (FOR ALL STAFF WORKERS) */}
                        {isStaff && (
                            <div className="dropdown" ref={dueRef} style={{ position: 'relative' }}>
                                <button
                                    type="button"
                                    className="due-btn"
                                    onClick={() => setShowDuePopup(v => !v)}
                                    aria-label="Outstanding Guest Dues"
                                    aria-expanded={showDuePopup}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 12px',
                                        borderRadius: 20,
                                        border: dueSummary.count > 0 ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                                        background: dueSummary.count > 0 ? '#fffbeb' : '#f8fafc',
                                        color: dueSummary.count > 0 ? '#b45309' : '#64748b',
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        boxShadow: dueSummary.count > 0 ? '0 2px 6px rgba(245, 158, 11, 0.25)' : 'none'
                                    }}
                                >
                                    <CircleDollarSign size={17} color={dueSummary.count > 0 ? '#d97706' : '#64748b'} />
                                    <span className="due-btn-label">
                                        <span className="due-btn-prefix">Due: </span><strong>ETB {dueSummary.total_due.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                                    </span>
                                    {dueSummary.count > 0 && (
                                        <span
                                            style={{
                                                background: '#dc2626',
                                                color: '#ffffff',
                                                borderRadius: 10,
                                                fontSize: 11,
                                                fontWeight: 700,
                                                padding: '1px 6px',
                                                marginLeft: 2
                                            }}
                                        >
                                            {dueSummary.count}
                                        </span>
                                    )}
                                </button>

                                {showDuePopup && (
                                    <div
                                        className="dropdown-menu due-dropdown-popup"
                                        style={{
                                            width: 430,
                                            maxWidth: 'calc(100vw - 20px)',
                                            right: 0,
                                            top: 'calc(100% + 8px)',
                                            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                                            borderRadius: 12,
                                            padding: 0,
                                            border: '1px solid #e2e8f0',
                                            zIndex: 1100,
                                            maxHeight: '85vh',
                                            overflowY: 'auto',
                                            display: 'block'
                                        }}
                                    >
                                        {/* Popup Header */}
                                        <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <CircleDollarSign size={18} color="#d97706" /> {user?.role === 'admin' ? 'Outstanding Guest Dues' : 'Guest Dues to Collect'}
                                                </div>
                                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                                    {dueSummary.count} room(s) with pending unpaid balance to collect
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <button
                                                    type="button"
                                                    onClick={loadDues}
                                                    title="Refresh Dues"
                                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                                                >
                                                    <RefreshCw size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowDuePopup(false)}
                                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>

                                        {/* Total Due Amount Highlight Banner */}
                                        <div style={{ padding: '12px 16px', background: dueSummary.total_due > 0 ? '#fef3c7' : '#ecfdf5', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 13, color: '#78350f', fontWeight: 600 }}>Uncollected Guest Balance:</span>
                                            <strong style={{ fontSize: 17, color: dueSummary.total_due > 0 ? '#b45309' : '#059669' }}>
                                                ETB {dueSummary.total_due.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </strong>
                                        </div>

                                        {/* Due Bookings List */}
                                        <div style={{ padding: '12px 16px' }}>
                                            {dueSummary.dues.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '24px 0', color: '#059669' }}>
                                                    <CheckCircle2 size={32} style={{ margin: '0 auto 8px' }} />
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>All Guest Dues Settled!</div>
                                                    <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>No active bookings with outstanding balances.</p>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                    {dueSummary.dues.map(d => {
                                                        const isSelected = settlingBookingId === d.id
                                                        return (
                                                            <div
                                                                key={d.id}
                                                                style={{
                                                                    border: '1px solid #e2e8f0',
                                                                    borderRadius: 8,
                                                                    padding: 12,
                                                                    background: isSelected ? '#eff6ff' : '#ffffff',
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                                                    <div>
                                                                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                                                                            Room {d.room_number} <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>({d.room_type})</span>
                                                                        </div>
                                                                        <div style={{ fontSize: 12, color: '#475569' }}>
                                                                            👤 {d.guest_name} • 📞 {d.guest_phone || 'N/A'}
                                                                        </div>
                                                                    </div>
                                                                    <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                                                                        DUE: ETB {Number(d.balance_amount).toFixed(2)}
                                                                    </span>
                                                                </div>

                                                                <div style={{ fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between', marginBottom: 8, background: '#f8fafc', padding: '4px 8px', borderRadius: 4 }}>
                                                                    <span>Billed: ETB {Number(d.total_amount).toFixed(2)}</span>
                                                                    <span>Paid: ETB {Number(d.paid_amount).toFixed(2)}</span>
                                                                    <span style={{ color: '#dc2626', fontWeight: 700 }}>Due: ETB {Number(d.balance_amount).toFixed(2)}</span>
                                                                </div>

                                                                {!isSelected ? (
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-sm btn-primary"
                                                                        onClick={() => startSettle(d)}
                                                                        style={{ width: '100%', fontSize: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                                                    >
                                                                        <span>Collect & Settle Due</span>
                                                                        <ChevronRight size={14} />
                                                                    </button>
                                                                ) : (
                                                                    /* Inline Settlement Form */
                                                                    <form onSubmit={(e) => handleSettleSubmit(e, d)} style={{ marginTop: 8, padding: 10, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
                                                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>
                                                                            Record Due Settlement for Room {d.room_number}
                                                                        </div>

                                                                        <div className="form-group" style={{ marginBottom: 6 }}>
                                                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>Amount to Collect (ETB) *</label>
                                                                            <input
                                                                                type="number"
                                                                                step="0.01"
                                                                                max={d.balance_amount}
                                                                                className="form-control"
                                                                                style={{ padding: '5px 8px', fontSize: 12 }}
                                                                                value={settleForm.amount}
                                                                                onChange={e => setSettleForm({ ...settleForm, amount: e.target.value })}
                                                                                required
                                                                            />
                                                                        </div>

                                                                        <div className="form-group" style={{ marginBottom: 6 }}>
                                                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>Payment Method *</label>
                                                                            <select
                                                                                className="form-control"
                                                                                style={{ padding: '5px 8px', fontSize: 12 }}
                                                                                value={settleForm.method}
                                                                                onChange={e => setSettleForm({ ...settleForm, method: e.target.value })}
                                                                            >
                                                                                {PAYMENT_METHODS.map(m => (
                                                                                    <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>

                                                                        <div className="form-group" style={{ marginBottom: 8 }}>
                                                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>Transaction / Receipt Ref *</label>
                                                                            <input
                                                                                className="form-control"
                                                                                style={{ padding: '5px 8px', fontSize: 12 }}
                                                                                value={settleForm.transaction_id}
                                                                                onChange={e => setSettleForm({ ...settleForm, transaction_id: e.target.value })}
                                                                                placeholder="e.g. Telebirr ID or Cash receipt #"
                                                                                required
                                                                            />
                                                                        </div>

                                                                        <div style={{ display: 'flex', gap: 6 }}>
                                                                            <button
                                                                                type="button"
                                                                                className="btn btn-sm btn-outline"
                                                                                onClick={() => setSettlingBookingId(null)}
                                                                                style={{ flex: 1, fontSize: 11, padding: '5px' }}
                                                                            >
                                                                                Cancel
                                                                            </button>
                                                                            <button
                                                                                type="submit"
                                                                                className="btn btn-sm btn-primary"
                                                                                disabled={settlingLoading}
                                                                                style={{ flex: 2, fontSize: 11, padding: '5px', fontWeight: 700 }}
                                                                            >
                                                                                {settlingLoading ? 'Saving...' : 'Save Payment'}
                                                                            </button>
                                                                        </div>
                                                                    </form>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* HOTEL AI TOGGLE BUTTON (PLACED ON TOPBAR FOR EASY ACCESS) */}
                        <button
                            type="button"
                            className="hotel-ai-topbar-toggle"
                            onClick={() => toggleAiPanel()}
                            aria-label="Toggle Hotel AI Right Panel"
                            title="Toggle Hotel AI Assistant (English & አማርኛ)"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 12px',
                                borderRadius: 20,
                                border: aiPanelOpen ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                                background: aiPanelOpen ? '#f0f9ff' : '#f8fafc',
                                color: aiPanelOpen ? '#0284c7' : '#64748b',
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: aiPanelOpen ? '0 2px 8px rgba(2, 132, 199, 0.2)' : 'none'
                            }}
                        >
                            <Sparkles size={16} color={aiPanelOpen ? '#0284c7' : '#64748b'} className={aiPanelOpen ? 'animate-pulse' : ''} />
                            <span>Hotel AI</span>
                            <span
                                style={{
                                    background: aiPanelOpen ? '#0284c7' : '#94a3b8',
                                    color: '#ffffff',
                                    borderRadius: 10,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '1px 6px'
                                }}
                            >
                                EN | አማ
                            </span>
                        </button>

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

                {/* Dedicated Real-Time Right-Side Mobile Banking Alert for Admin Phone/Desktop */}
                {user?.role === 'admin' && <AdminMobileBankingAlert />}

                <div className="page-content">
                    <Outlet />
                </div>

                {/* Hotel AI Assistant Placed on the Right Side of All Dashboard Parts in Small Compact Size */}
                <HotelAIWidget 
                    isOpen={aiPanelOpen}
                    onToggle={toggleAiPanel}
                />
            </div>
        </div>
    )
}
