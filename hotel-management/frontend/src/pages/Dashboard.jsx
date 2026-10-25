import { useCallback, useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import {
    BedDouble, Users, CalendarCheck, Sparkles, Wrench,
    Receipt, TrendingUp, Activity, RefreshCw
} from 'lucide-react'
import { getDashboard } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { OPERATIONS_ROLES } from '../constants/hotel'
import { greetingFor, formatMoney } from '../utils/format'
import DashboardHero from '../components/dashboard/DashboardHero'
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton'
import RailCard from '../components/dashboard/RailCard'
import RoomMeter from '../components/dashboard/RoomMeter'
import RevenueSpark from '../components/dashboard/RevenueSpark'
import BookingPipeline from '../components/dashboard/BookingPipeline'
import RoomTypes from '../components/dashboard/RoomTypes'
import StaffCard from '../components/dashboard/StaffCard'
import StaffModal from '../components/dashboard/StaffModal'
import RecentBookings from '../components/dashboard/RecentBookings'
import '../styles/dashboard.css'

/** Operations rail — the day's movement, in the order reception works it. */
function operationsRail(data) {
    return [
        { key: 'arrivals', label: 'Arrivals today', value: data.arrivals_today, icon: CalendarCheck, to: '/bookings', tone: 'is-accent' },
        { key: 'departures', label: 'Departures today', value: data.departures_today, icon: CalendarCheck, to: '/bookings', tone: 'is-warn' },
        { key: 'inhouse', label: 'In-house guests', value: data.in_house_guests, icon: Users, to: '/guests' },
        { key: 'cleaning', label: 'Cleaning queue', value: data.housekeeping?.pending, icon: Sparkles, to: '/housekeeping', note: `${data.housekeeping?.completed_today || 0} done today` },
        { key: 'repairs', label: 'Open repairs', value: data.maintenance?.open, icon: Wrench, to: '/maintenance', note: `${data.maintenance?.urgent_open || 0} urgent` },
        { key: 'unpaid', label: 'Outstanding', value: formatMoney(data.outstanding_balance), icon: Receipt, to: '/payments', tone: 'is-warn' },
    ]
}

function housekeepingRail(data) {
    return [
        { key: 'pending', label: 'Pending tasks', value: data.housekeeping?.pending, icon: Sparkles, to: '/housekeeping', tone: 'is-warn' },
        { key: 'progress', label: 'In progress', value: data.housekeeping?.in_progress, icon: Sparkles, to: '/housekeeping' },
        { key: 'done', label: 'Done today', value: data.housekeeping?.completed_today, icon: Sparkles, to: '/housekeeping', tone: 'is-accent' },
        { key: 'cleaning', label: 'Rooms to clean', value: data.rooms?.cleaning, icon: BedDouble, to: '/rooms' },
    ]
}

function maintenanceRail(data) {
    return [
        { key: 'open', label: 'Open tickets', value: data.maintenance?.open, icon: Wrench, to: '/maintenance', tone: 'is-warn' },
        { key: 'urgent', label: 'Urgent', value: data.maintenance?.urgent_open, icon: Wrench, to: '/maintenance', tone: 'is-bad' },
        { key: 'progress', label: 'In progress', value: data.maintenance?.in_progress, icon: Wrench, to: '/maintenance' },
        { key: 'resolved', label: 'Resolved', value: data.maintenance?.resolved, icon: Wrench, to: '/maintenance', tone: 'is-accent' },
        { key: 'blocked', label: 'Rooms offline', value: data.rooms?.maintenance, icon: BedDouble, to: '/rooms' },
    ]
}

export default function Dashboard() {
    const { user } = useAuth()
    const [data, setData] = useState(null)
    const [failed, setFailed] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [selectedPerson, setSelectedPerson] = useState(null)
    const [now, setNow] = useState(() => new Date())

    const load = useCallback(async () => {
        try {
            const res = await getDashboard()
            setData(res.data)
            setFailed(false)
        } catch {
            setFailed(true)
        }
    }, [])

    useEffect(() => { load() }, [load])

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    const refresh = async () => {
        setRefreshing(true)
        await load()
        setRefreshing(false)
    }

    // Customers land on the luxury hotel & park showcase
    if (user?.role === 'customer') return <Navigate to="/" replace />

    if (failed) {
        return (
            <div className="card empty-state">
                <Activity size={40} />
                <h3>Dashboard unavailable</h3>
                <p>The API did not respond. Check the backend and try again.</p>
                <button type="button" className="btn btn-primary" onClick={refresh} style={{ marginTop: 14 }}>
                    <RefreshCw size={15} />
                    Retry
                </button>
            </div>
        )
    }

    if (!data) return <DashboardSkeleton />

    const isOps = OPERATIONS_ROLES.includes(user?.role)
    const rail = isOps
        ? operationsRail(data)
        : user?.role === 'housekeeping'
            ? housekeepingRail(data)
            : maintenanceRail(data)

    const staff = data.users || []
    const showStaff = isOps && user?.role === 'admin'

    return (
        <div className="dash">
            <DashboardHero
                data={data}
                greeting={greetingFor(now)}
                userName={user?.name}
                now={now}
                onRefresh={refresh}
                refreshing={refreshing}
            />

            <div className="dash-rail" role="list">
                {rail.map(item => (
                    <RailCard
                        key={item.key}
                        icon={item.icon}
                        value={item.value ?? 0}
                        label={item.label}
                        note={item.note}
                        tone={item.tone}
                        to={item.to}
                    />
                ))}
            </div>

            {isOps && (
                <div className="dash-grid">
                    <section className="dash-tile dash-col-7">
                        <div className="dash-tile-head">
                            <h2 className="dash-tile-title">
                                <TrendingUp size={17} aria-hidden="true" />
                                Booked revenue
                            </h2>
                            <Link to="/reports" className="card-link">Reports</Link>
                        </div>
                        <RevenueSpark series={data.revenue_series || []} />
                        <dl className="dash-kv">
                            <div className="dash-kv-row">
                                <dt>This month</dt>
                                <dd className="is-accent">{formatMoney(data.monthly_revenue)}</dd>
                            </div>
                            <div className="dash-kv-row">
                                <dt>Booked today</dt>
                                <dd>{formatMoney(data.revenue_today)}</dd>
                            </div>
                            <div className="dash-kv-row">
                                <dt>Outstanding balance</dt>
                                <dd className={Number(data.outstanding_balance) > 0 ? 'is-warn' : ''}>
                                    {formatMoney(data.outstanding_balance)}
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <section className="dash-tile dash-col-5">
                        <div className="dash-tile-head">
                            <h2 className="dash-tile-title">
                                <BedDouble size={17} aria-hidden="true" />
                                Room status
                            </h2>
                            <Link to="/rooms" className="card-link">Grid</Link>
                        </div>
                        <RoomMeter rooms={data.rooms} total={data.total_rooms} />
                    </section>

                    <section className="dash-tile dash-col-6">
                        <div className="dash-tile-head">
                            <h2 className="dash-tile-title">
                                <CalendarCheck size={17} aria-hidden="true" />
                                Booking pipeline
                            </h2>
                            <span className="dash-count">{data.total_bookings ?? 0} total</span>
                        </div>
                        <BookingPipeline bookings={data.bookings} />
                    </section>

                    <section className="dash-tile dash-col-6">
                        <div className="dash-tile-head">
                            <h2 className="dash-tile-title">
                                <BedDouble size={17} aria-hidden="true" />
                                Room mix
                            </h2>
                            <Link to="/rooms" className="card-link">Rates</Link>
                        </div>
                        <RoomTypes types={data.room_types || []} />
                    </section>
                </div>
            )}

            {!isOps && (
                <div className="dash-grid">
                    <section className="dash-tile dash-col-12">
                        <div className="dash-tile-head">
                            <h2 className="dash-tile-title">
                                <BedDouble size={17} aria-hidden="true" />
                                Room status
                            </h2>
                            <Link to="/rooms" className="card-link">Grid</Link>
                        </div>
                        <RoomMeter rooms={data.rooms} total={data.total_rooms} />
                    </section>
                </div>
            )}

            {showStaff && staff.length > 0 && (
                <section>
                    <div className="dash-section-head">
                        <h2 className="dash-section-title">
                            <Users size={17} aria-hidden="true" />
                            Staff directory
                            <span className="dash-count">{staff.length} accounts</span>
                        </h2>
                        <Link to="/users" className="card-link">Manage all</Link>
                    </div>
                    <div className="dash-rail">
                        {staff.map(person => (
                            <StaffCard key={person.id} person={person} onSelect={setSelectedPerson} />
                        ))}
                    </div>
                </section>
            )}

            {isOps && <RecentBookings bookings={data.recent_bookings || []} />}

            {selectedPerson && (
                <StaffModal
                    person={selectedPerson}
                    canEdit={user?.role === 'admin'}
                    onClose={() => setSelectedPerson(null)}
                />
            )}
        </div>
    )
}
