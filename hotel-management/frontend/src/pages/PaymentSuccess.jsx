import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { CheckCircle2, AlertCircle, ArrowRight, FileText, Bell, CreditCard, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { verifyChapaPayment } from '../services/api'

export default function PaymentSuccess() {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const txRef = params.get('tx_ref') || ''
    const isSimulated = params.get('simulated') === '1'

    const [status, setStatus] = useState('verifying') // verifying | success | error
    const [payment, setPayment] = useState(null)
    const [errorMessage, setErrorMessage] = useState('')

    useEffect(() => {
        if (!txRef) {
            setStatus('error')
            setErrorMessage('No transaction reference found.')
            return
        }

        verifyChapaPayment(txRef)
            .then(res => {
                setPayment(res.data?.payment || null)
                setStatus('success')
                toast.success('Payment verified successfully!')
            })
            .catch(err => {
                setStatus('error')
                setErrorMessage(err.response?.data?.error || 'Verification failed. Please check with reception.')
            })
    }, [txRef])

    return (
        <div style={{ maxWidth: 640, margin: '30px auto', padding: '0 16px' }}>
            <div className="card" style={{ padding: '36px 32px', textAlign: 'center' }}>
                {status === 'verifying' && (
                    <div style={{ padding: '40px 0' }}>
                        <div className="spinner" style={{ margin: '0 auto 16px', width: 42, height: 42 }} />
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
                            Verifying Payment with Chapa...
                        </h3>
                        <p style={{ color: '#6b7280', fontSize: 14 }}>
                            Communicating securely with the Chapa gateway to confirm transaction:
                        </p>
                        <code style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: 4, fontSize: 13, display: 'inline-block', marginTop: 8 }}>
                            {txRef}
                        </code>
                    </div>
                )}

                {status === 'error' && (
                    <div style={{ padding: '24px 0' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <AlertCircle size={36} color="#ef4444" />
                        </div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>
                            Payment Verification Issue
                        </h2>
                        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
                            {errorMessage}
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button className="btn btn-outline" onClick={() => window.location.reload()}>
                                Try Again
                            </button>
                            <button className="btn btn-primary" onClick={() => navigate('/bookings')}>
                                Return to Bookings
                            </button>
                        </div>
                    </div>
                )}

                {status === 'success' && (
                    <div>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <CheckCircle2 size={44} color="#16a34a" />
                        </div>

                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
                            <ShieldCheck size={14} /> Chapa Verified & Secure
                        </div>

                        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                            Payment Confirmed!
                        </h2>
                        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
                            Thank you! Your payment has been received and your booking is confirmed.
                        </p>

                        {/* Transaction Receipt Card */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, textAlign: 'left', marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 12, marginBottom: 12 }}>
                                <span style={{ color: '#64748b', fontSize: 13 }}>Amount Paid:</span>
                                <strong style={{ fontSize: 18, color: '#0f172a' }}>
                                    ETB {Number(payment?.amount || 0).toFixed(2)}
                                </strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                                <span style={{ color: '#64748b' }}>Booking Reference:</span>
                                <strong style={{ color: '#334155' }}>Booking #{payment?.booking_id}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                                <span style={{ color: '#64748b' }}>Room:</span>
                                <span style={{ color: '#334155' }}>Room {payment?.room_number || 'Assigned'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                                <span style={{ color: '#64748b' }}>Guest Name:</span>
                                <span style={{ color: '#334155' }}>{payment?.guest_name || 'Guest'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                                <span style={{ color: '#64748b' }}>Payment Method:</span>
                                <span style={{ color: '#334155', textTransform: 'capitalize', fontWeight: 600 }}>
                                    Chapa Gateway (Telebirr / CBE / Card)
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingTop: 8, borderTop: '1px dashed #cbd5e1' }}>
                                <span style={{ color: '#94a3b8' }}>Transaction Ref:</span>
                                <code style={{ color: '#475569' }}>{txRef}</code>
                            </div>
                        </div>

                        {/* Secure Notification Alert */}
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
                            <Bell size={20} color="#2563eb" style={{ flexShrink: 0 }} />
                            <div style={{ fontSize: 13, color: '#1e40af' }}>
                                <strong>Secure Notification Sent:</strong> A confirmation alert has been delivered to your in-app notification center and recorded for hotel administration.
                            </div>
                        </div>

                        {/* Action Navigation */}
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <Link to="/invoices" className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                                <FileText size={16} /> View Invoice
                            </Link>
                            <Link to="/bookings" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                                View Bookings <ArrowRight size={16} />
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
