import { Link } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'
import { bookingMeta } from '../../constants/hotel'
import { formatMoneyPrecise, formatShortDate } from '../../utils/format'

/** Latest bookings, with the guest-journey stage called out on each row. */
export default function RecentBookings({ bookings = [] }) {
    return (
        <section className="dash-tile">
            <div className="dash-tile-head">
                <h2 className="dash-tile-title">
                    <CalendarCheck size={17} aria-hidden="true" />
                    Recent bookings
                </h2>
                <Link to="/bookings" className="card-link">Full registry</Link>
            </div>

            <div className="table-container" style={{ margin: 0, padding: 0 }}>
                <table>
                    <thead>
                        <tr>
                            <th>Ref</th>
                            <th>Guest</th>
                            <th>Room</th>
                            <th>Check in</th>
                            <th>Check out</th>
                            <th>Amount</th>
                            <th>Stage</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bookings.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="table-empty">
                                    Nulla pariatur — no bookings on record yet.
                                </td>
                            </tr>
                        ) : (
                            bookings.map(booking => {
                                const meta = bookingMeta(booking.status)
                                return (
                                    <tr key={booking.id}>
                                        <td className="tp-mono" style={{ color: 'var(--tp-acc)' }}>#{booking.id}</td>
                                        <td style={{ fontWeight: 600 }}>{booking.guest_name}</td>
                                        <td>
                                            <span className="dash-count">Room {booking.room_number}</span>
                                        </td>
                                        <td>{formatShortDate(booking.check_in)}</td>
                                        <td>{formatShortDate(booking.check_out)}</td>
                                        <td style={{ fontWeight: 700 }}>{formatMoneyPrecise(booking.total_amount)}</td>
                                        <td>
                                            <span className={`badge ${meta.badge}`}>{meta.label}</span>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
