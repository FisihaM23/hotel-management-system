import { useEffect, useState } from 'react'
import { FileText, Download, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { getInvoices, initializeChapaPayment } from '../services/api'

const statusBadge = { draft: 'badge-gray', sent: 'badge-info', paid: 'badge-success', overdue: 'badge-danger' }

export default function Invoices() {
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [payingId, setPayingId] = useState(null)

    const load = () => {
        setLoading(true)
        getInvoices().then(r => setInvoices(r.data || [])).catch(() => toast.error('Failed to load invoices')).finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0)

    const handleChapaPay = async (bookingId, amount) => {
        setPayingId(bookingId)
        const toastId = toast.loading('Initializing Chapa Payment...')
        try {
            const res = await initializeChapaPayment({ booking_id: Number(bookingId), amount: Number(amount) })
            toast.dismiss(toastId)
            if (res.data?.checkout_url) {
                window.location.href = res.data.checkout_url
            } else {
                toast.error('Unable to redirect to Chapa')
            }
        } catch (err) {
            toast.dismiss(toastId)
            toast.error(err.response?.data?.error || 'Failed to initialize payment')
        } finally {
            setPayingId(null)
        }
    }

    const handleDownload = (inv) => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
        <html><head><title>Invoice #${inv.id}</title></head>
        <body style="font-family:sans-serif;padding:40px">
          <h2>Invoice #${inv.id}</h2>
          <p><strong>Booking ID:</strong> ${inv.booking_id}</p>
          <p><strong>Guest:</strong> ${inv.guest_name || 'N/A'}</p>
          <p><strong>Amount:</strong> $${Number(inv.total || 0).toFixed(2)}</p>
          <p><strong>Tax (10%):</strong> $${Number(inv.tax_amount || 0).toFixed(2)}</p>
          <p><strong>Date:</strong> ${new Date(inv.created_at).toLocaleDateString()}</p>
          <p><strong>Status:</strong> ${inv.status}</p>
        </body></html>
      `);
        printWindow.document.close();
        printWindow.print();
    };

    return (
        <div>
            <div className="page-header">
                <h2>Invoices</h2>
            </div>

            <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#dbeafe' }}><FileText color="#1d4ed8" /></div>
                    <div className="stat-info"><h3>{invoices.length}</h3><p>Total Invoices</p></div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#d1fae5' }}><FileText color="#059669" /></div>
                    <div className="stat-info"><h3>${totalAmount.toFixed(2)}</h3><p>Total Amount</p></div>
                </div>
            </div>

            <div className="search-bar">
                <button className="btn btn-outline" onClick={load}>Refresh</button>
            </div>

            <div className="card">
                {loading ? <div className="loading"><div className="spinner" />Loading...</div> : (
                    <div className="table-container">
                        <table>
                            <thead><tr><th>Invoice #</th><th>Date</th><th>Bookings</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {invoices.length === 0
                                    ? <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>No invoices found</td></tr>
                                    : invoices.map(inv => (
                                        <tr key={inv.id}>
                                            <td style={{ fontWeight: 600 }}>{inv.invoice_number}</td>
                                            <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                                            <td>{inv.booking_id}</td>
                                            <td style={{ fontWeight: 600 }}>${Number(inv.total || 0).toFixed(2)}</td>
                                            <td><span className={`badge ${statusBadge[inv.status]}`} style={{ textTransform: 'capitalize' }}>{inv.status}</span></td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    {inv.status !== 'paid' && (
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ background: '#059669', color: '#fff', fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                            disabled={payingId === inv.booking_id}
                                                            onClick={() => handleChapaPay(inv.booking_id, inv.total)}
                                                            title="Pay with Chapa"
                                                        >
                                                            <Zap size={11} /> {payingId === inv.booking_id ? 'Loading...' : 'Pay Chapa'}
                                                        </button>
                                                    )}
                                                    <button className="btn btn-outline btn-sm btn-icon" title="Download" onClick={() => handleDownload(inv)}><Download size={13} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}