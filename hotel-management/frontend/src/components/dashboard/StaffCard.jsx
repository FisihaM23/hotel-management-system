/**
 * One person in the staff rail. Clicking opens the detail sheet.
 * Renders as a plain chip when no handler is supplied.
 */
export default function StaffCard({ person, onSelect }) {
    const isMulugeta = person.email === 'befather7@gmail.com' || person.name?.toLowerCase().includes('mulugeta')
    const initial = person.name?.charAt(0).toUpperCase() || '?'
    const isActive = person.status === 'active'
    const dotColor = isActive ? 'var(--tp-ok)' : 'var(--tp-bad)'

    const body = (
        <>
            <div className="dash-staff-top">
                <span className={`dash-staff-avatar${isActive ? '' : ' is-inactive'}${isMulugeta ? ' is-dev-staff-avatar' : ''}`}>
                    {isMulugeta ? (
                        <img
                            src="/mulugeta.jpg"
                            alt="Mulugeta Fisiha"
                            className="dash-staff-thumb-img"
                            onError={(e) => { e.target.style.display = 'none' }}
                        />
                    ) : null}
                    {(!isMulugeta) && initial}
                    <span className="dash-staff-dot" style={{ background: dotColor }} aria-hidden="true" />
                </span>
                <span style={{ minWidth: 0 }}>
                    <span className="dash-staff-name truncate" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {person.name}
                        {isMulugeta && <span className="dev-mini-pill">DEV</span>}
                    </span>
                    <span className="dash-staff-role">{person.role}</span>
                </span>
            </div>
            <span className="dash-rail-note truncate" style={{ display: 'block' }}>{person.email}</span>
        </>
    )

    if (!onSelect) {
        return <div className="dash-rail-card">{body}</div>
    }

    return (
        <button
            type="button"
            className="dash-rail-card"
            onClick={() => onSelect(person)}
            aria-label={`View details for ${person.name}`}
        >
            {body}
        </button>
    )
}
