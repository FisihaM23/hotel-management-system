import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone, CheckCircle2, X } from 'lucide-react'

/** Staff detail sheet. Escape and backdrop click both close it. */
export default function StaffModal({ person, canEdit, onClose }) {
    useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    if (!person) return null

    const isActive = person.status === 'active'
    const isMulugeta = person.email === 'befather7@gmail.com' || person.name?.toLowerCase().includes('mulugeta')

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" role="dialog" aria-modal="true" aria-label={`${person.name} details`}>
                <div className="modal-header">
                    <div className="dash-staff-top">
                        <span className={`dash-staff-avatar${isActive ? '' : ' is-inactive'}${isMulugeta ? ' is-dev-staff-avatar' : ''}`}>
                            {isMulugeta ? (
                                <img
                                    src="/mulugeta.jpg"
                                    alt="Mulugeta Fisiha"
                                    className="dash-staff-thumb-img"
                                    onError={(e) => { e.target.style.display = 'none' }}
                                />
                            ) : (
                                person.name?.charAt(0).toUpperCase()
                            )}
                        </span>
                        <span style={{ minWidth: 0 }}>
                            <h3 className="truncate" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {person.name}
                                {isMulugeta && <span className="dev-mini-pill">DEV</span>}
                            </h3>
                            <span className={`role-chip role-${person.role}`}>{person.role}</span>
                        </span>
                    </div>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <dl className="dash-kv">
                        <div className="dash-kv-row">
                            <dt><Mail size={15} /> Email</dt>
                            <dd className="is-text">{person.email || '—'}</dd>
                        </div>
                        <div className="dash-kv-row">
                            <dt><Phone size={15} /> Phone</dt>
                            <dd className="is-text">{person.phone || 'Not provided'}</dd>
                        </div>
                        <div className="dash-kv-row">
                            <dt><CheckCircle2 size={15} /> Account</dt>
                            <dd className={isActive ? 'is-accent' : 'is-bad'}>{person.status}</dd>
                        </div>
                    </dl>
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
                    {canEdit && (
                        <Link to="/users" className="btn btn-primary" onClick={onClose}>Edit account</Link>
                    )}
                </div>
            </div>
        </div>
    )
}
