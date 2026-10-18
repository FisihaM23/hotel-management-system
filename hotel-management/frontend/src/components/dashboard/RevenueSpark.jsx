import { formatMoney, formatShortDate } from '../../utils/format'

/** Seven-day booked-revenue bars. Highlights the peak day. */
export default function RevenueSpark({ series = [] }) {
    const total = series.reduce((sum, day) => sum + Number(day.total || 0), 0)
    const peak = series.reduce((max, day) => Math.max(max, Number(day.total || 0)), 0)

    if (series.length === 0) {
        return <p className="dash-rail-note">Nulla pariatur — no revenue recorded yet.</p>
    }

    return (
        <>
            <div className="dash-spark-total">
                <strong>{formatMoney(total)}</strong>
                <span className="tp-eyebrow">booked · last 7 days</span>
            </div>

            <div className="dash-spark">
                {series.map(day => {
                    const value = Number(day.total || 0)
                    const height = peak > 0 ? (value / peak) * 100 : 0
                    const isPeak = peak > 0 && value === peak

                    return (
                        <div
                            key={day.date}
                            className={`dash-spark-col${isPeak ? ' is-peak' : ''}${value === 0 ? ' is-empty' : ''}`}
                            title={`${formatShortDate(day.date)} — ${formatMoney(value)}`}
                        >
                            <div className="dash-spark-bar" style={{ '--h': `${height}%` }} />
                            <span className="dash-spark-label">{day.label}</span>
                        </div>
                    )
                })}
            </div>
        </>
    )
}
