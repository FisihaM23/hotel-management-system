import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Smartphone, CheckCircle2, Copy, Check, ExternalLink,
    X, BellRing, ArrowRight, ShieldCheck, ChevronUp, ChevronDown
} from 'lucide-react'
import { getRecentAdminAlerts, PAYMENT_METHODS } from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

/**
 * Web Audio API audio chime for instant phone alert when customer sends money
 */
function playPaymentAlertChime() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        if (!AudioContextClass) return
        const ctx = new AudioContextClass()

        const now = ctx.currentTime
        // Note 1: 587.33 Hz (D5) - soft sine
        const osc1 = ctx.createOscillator()
        const gain1 = ctx.createGain()
        osc1.type = 'sine'
        osc1.frequency.setValueAtTime(587.33, now)
        gain1.gain.setValueAtTime(0.2, now)
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
        osc1.connect(gain1)
        gain1.connect(ctx.destination)
        osc1.start(now)
        osc1.stop(now + 0.3)

        // Note 2: 880 Hz (A5) - bell triangle
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = 'triangle'
        osc2.frequency.setValueAtTime(880, now + 0.12)
        gain2.gain.setValueAtTime(0.25, now + 0.12)
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.start(now + 0.12)
        osc2.stop(now + 0.55)

        // Note 3: 1174.66 Hz (D6) - bright chime
        const osc3 = ctx.createOscillator()
        const gain3 = ctx.createGain()
        osc3.type = 'sine'
        osc3.frequency.setValueAtTime(1174.66, now + 0.25)
        gain3.gain.setValueAtTime(0.3, now + 0.25)
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.7)
        osc3.connect(gain3)
        gain3.connect(ctx.destination)
        osc3.start(now + 0.25)
        osc3.stop(now + 0.7)
    } catch {
        // AudioContext may need initial user interaction
    }
}

/**
 * Trigger smartphone vibration for mobile banking notification
 */
function triggerPhoneVibration() {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
            navigator.vibrate([200, 100, 200, 100, 300])
        } catch {
            // Ignore if vibration is restricted
        }
    }
}

export default function AdminMobileBankingAlert() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const isAdmin = user && user.role === 'admin'

    const [alerts, setAlerts] = useState([])
    const [minimized, setMinimized] = useState(false)
    const [copiedTx, setCopiedTx] = useState(null)
    const knownIdsRef = useRef(new Set())
    const initialLoadDone = useRef(false)

    // Load previously seen payments from localStorage to avoid spamming on page reload
    useEffect(() => {
        if (!isAdmin) return
        try {
            const stored = JSON.parse(localStorage.getItem('hms_seen_admin_payments') || '[]')
            if (Array.isArray(stored)) {
                stored.forEach(id => knownIdsRef.current.add(id))
            }
        } catch {
            // ignore
        }
    }, [isAdmin])

    const saveSeen = (idList) => {
        try {
            const arr = Array.from(knownIdsRef.current).slice(-100)
            localStorage.setItem('hms_seen_admin_payments', JSON.stringify(arr))
        } catch {
            // ignore
        }
    }

    // Poll for recent payments for admin mobile banking
    useEffect(() => {
        if (!isAdmin) return

        const checkRecentPayments = async () => {
            try {
                const res = await getRecentAdminAlerts()
                const list = Array.isArray(res.data) ? res.data : []
                if (!initialLoadDone.current) {
                    // Seed known IDs so existing historical payments do not all pop up at once on initial load
                    list.forEach(p => knownIdsRef.current.add(p.id))
                    saveSeen()
                    initialLoadDone.current = true
                    return
                }

                const brandNew = list.filter(p => !knownIdsRef.current.has(p.id))
                if (brandNew.length > 0) {
                    // Mark as known
                    brandNew.forEach(p => knownIdsRef.current.add(p.id))
                    saveSeen()

                    // Play chime & vibrate admin phone
                    playPaymentAlertChime()
                    triggerPhoneVibration()

                    // Add to popup alerts queue
                    setAlerts(prev => [...brandNew, ...prev])
                    setMinimized(false)
                }
            } catch {
                // Silently retry
            }
        }

        checkRecentPayments()
        const timer = setInterval(checkRecentPayments, 4500)
        return () => clearInterval(timer)
    }, [isAdmin])

    if (!isAdmin || alerts.length === 0) return null

    const currentAlert = alerts[0]
    const methodMeta = PAYMENT_METHODS.find(m => m.value === currentAlert.method) || {
        value: currentAlert.method,
        label: (currentAlert.method || 'Mobile Banking').replace('_', ' ').toUpperCase(),
        icon: '📱'
    }

    const dismissAlert = (id) => {
        setAlerts(prev => prev.filter(a => a.id !== id))
    }

    const handleCopy = (text) => {
        if (!text) return
        navigator.clipboard?.writeText(text)
        setCopiedTx(text)
        toast.success('Transaction reference copied!')
        setTimeout(() => setCopiedTx(null), 2500)
    }

    const handleViewBooking = (bookingId) => {
        dismissAlert(currentAlert.id)
        navigate(`/bookings?search=${bookingId}`)
    }

    const handleViewPayments = () => {
        dismissAlert(currentAlert.id)
        navigate('/payments')
    }

    // Minimized Floating Pill on the right side
    if (minimized) {
        return (
            <div
                style={{
                    position: 'fixed',
                    right: 20,
                    top: 80,
                    zIndex: 99999,
                    background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
                    color: '#ffffff',
                    borderRadius: 30,
                    padding: '8px 16px',
                    boxShadow: '0 8px 24px rgba(4, 120, 87, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    animation: 'bounce 2s infinite'
                }}
                onClick={() => setMinimized(false)}
                title="Click to view Admin Mobile Banking alert"
            >
                <div style={{ position: 'relative' }}>
                    <Smartphone size={20} color="#34d399" />
                    <span
                        style={{
                            position: 'absolute',
                            top: -4,
                            right: -6,
                            background: '#ef4444',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 800,
                            borderRadius: '50%',
                            width: 16,
                            height: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1.5px solid #fff'
                        }}
                    >
                        {alerts.length}
                    </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                    Customer Sent ETB {Number(currentAlert.amount).toFixed(2)}
                </div>
                <ChevronDown size={16} />
            </div>
        )
    }

    return (
        <aside
            aria-live="assertive"
            aria-label="Admin Mobile Banking Payment Alert"
            style={{
                position: 'fixed',
                right: 20,
                top: 75,
                zIndex: 99999,
                width: 390,
                maxWidth: 'calc(100vw - 32px)',
                background: '#ffffff',
                borderRadius: 16,
                boxShadow: '0 20px 45px -10px rgba(0,0,0,0.35), 0 0 0 1.5px #10b981',
                overflow: 'hidden',
                animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
        >
            {/* Header: Admin Mobile Banking Identifier */}
            <div
                style={{
                    background: 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #059669 100%)',
                    padding: '14px 16px',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                        style={{
                            background: 'rgba(255, 255, 255, 0.18)',
                            padding: 8,
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <Smartphone size={22} color="#6ee7b7" />
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>Admin Mobile Banking Alert</span>
                            <span
                                style={{
                                    display: 'inline-block',
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#34d399',
                                    boxShadow: '0 0 8px #34d399'
                                }}
                            />
                        </div>
                        <div style={{ fontSize: 11, color: '#a7f3d0', marginTop: 1 }}>
                            Customer Money Sent to Admin Account (0932338138)
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                        type="button"
                        onClick={() => setMinimized(true)}
                        title="Minimize"
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            border: 'none',
                            color: '#fff',
                            borderRadius: 6,
                            padding: '4px 6px',
                            cursor: 'pointer'
                        }}
                    >
                        <ChevronUp size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => dismissAlert(currentAlert.id)}
                        title="Close popup"
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            border: 'none',
                            color: '#fff',
                            borderRadius: 6,
                            padding: '4px 6px',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Payment Method Banner (Identifies by WHAT payment method the customer sent) */}
            <div
                style={{
                    background: '#f0fdf4',
                    padding: '10px 16px',
                    borderBottom: '1px solid #dcfce7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                        Payment Method:
                    </span>
                    <span
                        style={{
                            background: '#d1fae5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                            padding: '3px 9px',
                            borderRadius: 14,
                            fontWeight: 800,
                            fontSize: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5
                        }}
                    >
                        <span>{methodMeta.icon}</span>
                        <span>{methodMeta.label}</span>
                    </span>
                </div>

                <span style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>
                    {alerts.length > 1 ? `1 of ${alerts.length} new` : 'Just now'}
                </span>
            </div>

            {/* Body: Amount & Customer Details */}
            <div style={{ padding: '16px' }}>
                {/* Large Amount Display */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                        border: '1.5px solid #a7f3d0',
                        borderRadius: 12,
                        padding: '14px 16px',
                        textAlign: 'center',
                        marginBottom: 14
                    }}
                >
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Amount Received into Admin Account
                    </div>
                    <div
                        style={{
                            fontSize: 28,
                            fontWeight: 900,
                            color: '#065f46',
                            margin: '4px 0 2px',
                            letterSpacing: '-0.5px'
                        }}
                    >
                        + ETB {Number(currentAlert.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <ShieldCheck size={14} color="#059669" />
                        <span>Verified target: <strong>Mulugeta Fisiha (0932338138)</strong></span>
                    </div>
                </div>

                {/* Customer & Booking Particulars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
                        <span style={{ color: '#64748b' }}>👤 Customer:</span>
                        <strong style={{ color: '#0f172a' }}>{currentAlert.guest_name || 'Customer'}</strong>
                    </div>

                    {currentAlert.guest_phone && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
                            <span style={{ color: '#64748b' }}>📞 Phone:</span>
                            <strong style={{ color: '#0f172a' }}>{currentAlert.guest_phone}</strong>
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: 6 }}>
                        <span style={{ color: '#64748b' }}>🏨 Room & Booking:</span>
                        <strong style={{ color: '#0f172a' }}>
                            Room {currentAlert.room_number || 'N/A'} <span style={{ color: '#64748b', fontWeight: 500 }}>(#{currentAlert.booking_id})</span>
                        </strong>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            background: '#f8fafc',
                            borderRadius: 6
                        }}
                    >
                        <span style={{ color: '#64748b' }}>🔑 Transaction ID:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: 4, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                                {currentAlert.transaction_id || 'N/A'}
                            </code>
                            {currentAlert.transaction_id && (
                                <button
                                    type="button"
                                    onClick={() => handleCopy(currentAlert.transaction_id)}
                                    title="Copy transaction code"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: copiedTx === currentAlert.transaction_id ? '#059669' : '#64748b',
                                        padding: 2
                                    }}
                                >
                                    {copiedTx === currentAlert.transaction_id ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Quick Action Buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                        type="button"
                        onClick={() => dismissAlert(currentAlert.id)}
                        style={{
                            flex: 1,
                            background: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            padding: '9px 12px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)'
                        }}
                    >
                        <CheckCircle2 size={15} />
                        <span>Confirm & Acknowledge</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleViewBooking(currentAlert.booking_id)}
                        style={{
                            background: '#f1f5f9',
                            color: '#1e293b',
                            border: '1px solid #cbd5e1',
                            padding: '9px 12px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                        }}
                        title="Open booking details"
                    >
                        <span>Booking</span>
                        <ExternalLink size={13} />
                    </button>
                </div>
            </div>

            {/* Footer Notice */}
            <div
                style={{
                    background: '#f8fafc',
                    padding: '8px 16px',
                    borderTop: '1px solid #e2e8f0',
                    fontSize: 11,
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}
            >
                <span>📱 Admin Mobile Banking Exclusive</span>
                <button
                    type="button"
                    onClick={handleViewPayments}
                    style={{ background: 'none', border: 'none', color: '#059669', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                    All Payments →
                </button>
            </div>
        </aside>
    )
}
