import { BOOKING_FLOW, bookingMeta } from '../../constants/hotel'

/** Booking counts read in guest-journey order, each bar scaled to the busiest stage. */
export default function BookingPipeline({ bookings = {} }) {
    const peak = BOOKING_FLOW.reduce((max, status) => Math.max(max, bookings[status] || 0), 0)

    return (
        <div className="dash-pipeline">
            {BOOKING_FLOW.map(status => {
                const count = bookings[status] || 0
                const meta = bookingMeta(status)
                const width = peak > 0 ? (count / peak) * 100 : 0

                return (
                    <div key={status} className="dash-pipeline-row">
                        <span className="dash-pipeline-name">{meta.label}</span>
                        <span className="dash-pipeline-bar">
                            <span
                                className={`dash-pipeline-fill ${meta.fill}`}
                                style={{ '--w': `${width}%` }}
                            />
                        </span>
                        <span className="dash-pipeline-count">{count}</span>
                    </div>
                )
            })}
        </div>
    )
}
