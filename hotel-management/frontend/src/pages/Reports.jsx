import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getReports } from '../services/api'

export default function Reports() {
    const [type, setType] = useState('revenue')
    const [from, setFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0] })
    const [to, setTo] = useState(() => new Date().toISOString().split('T')[0])
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)

    const load = () => {
        setLoading(true)
        getReports(type, from, to).then(r => setData(r.data)).catch(() => toast.error('Failed to load report')).finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    return (
        <div>
            <div className="page-header"><h2>Reports</h2></div>

            <div className="card" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Report Type</label>
                        <select className="form-control" value={type} onChange={e => setType(e.target.value)}>
                            <option value="revenue">Revenue</option>
                            <option value="bookings">Bookings</option>
                            <option value="occupancy">Occupancy</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">From</label>
                        <input className="form-control" type="date" value={from} onChange={e => setFrom(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">To</label>
                        <input className="form-control" type="date" value={to} onChange={e => setTo(e.target.value)} />
                    </div>
                    <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Generate'}</button>
                </div>
            </div>

            {loading && <div className="loading"><div className="spinner" />Generating report...</div>}

            {data && !loading && (
                <div>
                    {/* Summary Cards */}
                    <div className="stats-grid" style={{ marginBottom: 24 }}>
                        {data.summary && Object.entries(data.summary).map(([k, v]) => (
                            <div key={k} className="stat-card">
                                <div className="stat-icon" style={{ background: '#dbeafe' }}><BarChart3 color="#1d4ed8" /></div>
                                <div className="stat-info">
                                    <h3>{typeof v === 'number' && k.includes('amount') ? `$${Number(v).toFixed(2)}` : v}</h3>
                                    <p style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Data Table */}
                    {data.rows && data.rows.length > 0 && (
                        <div className="card">
                            <h3 style={{ marginBottom: 16, fontWeight: 600, textTransform: 'capitalize' }}>{type} Report ({from} to {to})</h3>
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>{Object.keys(data.rows[0]).map(k => <th key={k} style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {data.rows.map((row, i) => (
                                            <tr key={i}>
                                                {Object.values(row).map((v, j) => <td key={j}>{v ?? '-'}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
