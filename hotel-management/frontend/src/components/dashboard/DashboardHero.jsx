import { Link } from 'react-router-dom'
import {
    CalendarCheck, BedDouble, Sparkles, RefreshCw, Clock
} from 'lucide-react'
import { formatClock, formatStampDate, formatNumber } from '../../utils/format'

const FACTS = (data) => [
    { label: 'Arrivals today', value: data.arrivals_today, tone: 'is-accent' },
    { label: 'Departures today', value: data.departures_today, tone: 'is-warn' },
    { label: 'In-house guests', value: data.in_house_guests },
    { label: 'Rooms ready', value: data.rooms?.available ?? 0 },
    { label: 'Upcoming arrivals', value: data.upcoming_arrivals, tone: 'is-mute' },
]

/**
 * The dashboard's hero: one giant number (occupancy), the live property clock,
 * today's movement, and the quick actions.
 */
export default function DashboardHero({ data, greeting, userName, now, onRefresh, refreshing }) {
    const occupied = data.rooms?.occupied ?? 0
    const total = data.total_rooms ?? 0

    return (
        <section className="dash-hero">
            <div className="dash-hero-left">
                <div className="dash-live">
                    <span className="dash-live-dot" aria-hidden="true" />
                    <span className="dash-live-label">Operational</span>
                    <span className="dash-stamp">
                        <Clock size={12} aria-hidden="true" />
                        {formatStampDate(now)} · {formatClock(now)}
                    </span>
                </div>

                <div className="dash-hero-profile-wrap">
                    <div className="dash-avatar-halo-container">
                        <div className="dash-avatar-halo-ring" aria-hidden="true" />
                        <div className="dash-avatar-halo-ring-2" aria-hidden="true" />
                        <img
                            src="/mulugeta.jpg"
                            alt="Mulugeta Fisiha"
                            className="dash-dev-avatar"
                            onError={(e) => {
                                e.target.style.display = 'none'
                                if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'
                            }}
                        />
                        <div className="dash-dev-avatar-fallback" style={{ display: 'none' }}>
                            {userName?.charAt(0)?.toUpperCase() || 'M'}
                        </div>
                        <span className="dash-dev-badge" title="Project Developer & System Admin">
                            DEV
                        </span>
                    </div>

                    <div className="dash-profile-meta">
                        <div className="dash-dev-title-row">
                            <span className="dash-dev-tag">Project Developer</span>
                            <span className="dash-role-tag">System Admin</span>
                        </div>
                        <h1 className="dash-greeting">
                            {greeting}, <em>{userName || 'Mulugeta Fisiha'}</em>
                        </h1>
                        <p className="dash-hero-subtitle">
                            Hotel Management System Core Architect & Lead Developer
                        </p>
                    </div>
                </div>

                <div className="dash-metric">
                    <div className="dash-metric-value tp-hero">
                        {formatNumber(data.occupancy_rate ?? 0)}
                        <span className="dash-metric-suffix">%</span>
                    </div>
                    <div className="dash-metric-meta">
                        <span className="dash-metric-title">Occupancy right now</span>
                        <span className="dash-metric-note">
                            {formatNumber(occupied)} of {formatNumber(total)} rooms in use
                        </span>
                    </div>
                </div>

                <dl className="dash-facts">
                    {FACTS(data).map(fact => (
                        <div key={fact.label} className="dash-fact">
                            <dt className="tp-eyebrow">{fact.label}</dt>
                            <dd className={`dash-fact-value${fact.tone ? ` ${fact.tone}` : ''}`}>
                                {formatNumber(fact.value)}
                            </dd>
                        </div>
                    ))}
                </dl>
            </div>

            <div className="dash-hero-actions">
                <Link to="/bookings" className="dash-action is-primary">
                    <CalendarCheck size={15} aria-hidden="true" />
                    Bookings
                </Link>
                <Link to="/rooms" className="dash-action">
                    <BedDouble size={15} aria-hidden="true" />
                    Rooms
                </Link>
                <Link to="/housekeeping" className="dash-action">
                    <Sparkles size={15} aria-hidden="true" />
                    Housekeeping
                </Link>
                <button
                    type="button"
                    className="dash-action dash-action-icon"
                    onClick={onRefresh}
                    aria-label="Reload dashboard data"
                    title="Reload dashboard data"
                >
                    <RefreshCw size={15} className={refreshing ? 'spin' : undefined} aria-hidden="true" />
                </button>
            </div>
        </section>
    )
}
