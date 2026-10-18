import { Link } from 'react-router-dom'

/**
 * One card in the dashboard's horizontal rail.
 * Renders as a link, a button, or a plain card depending on what is passed.
 */
export default function RailCard({ icon: Icon, value, label, note, tone = '', to, onClick }) {
    const body = (
        <>
            <div className="dash-rail-top">
                <span className="dash-rail-label">{label}</span>
                {Icon && <Icon size={16} aria-hidden="true" />}
            </div>
            <div className={`dash-rail-value${tone ? ` ${tone}` : ''}`}>{value}</div>
            {note && <div className="dash-rail-note">{note}</div>}
        </>
    )

    if (to) {
        return (
            <Link to={to} className="dash-rail-card">
                {body}
            </Link>
        )
    }

    if (onClick) {
        return (
            <button type="button" className="dash-rail-card" onClick={onClick}>
                {body}
            </button>
        )
    }

    return <div className="dash-rail-card">{body}</div>
}
