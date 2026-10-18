import { ROOM_STATUS } from '../../constants/hotel'

/** Segmented room-status bar plus its legend — one glance, whole property. */
export default function RoomMeter({ rooms = {}, total = 0 }) {
    const safeTotal = total > 0 ? total : 1

    return (
        <div>
            <div className="dash-meter" role="img" aria-label={`Room status across ${total} rooms`}>
                {ROOM_STATUS.map(({ key, label, modifier }) => {
                    const count = rooms[key] || 0
                    if (count === 0) return null
                    return (
                        <span
                            key={key}
                            className={`dash-meter-seg ${modifier}`}
                            style={{ width: `${(count / safeTotal) * 100}%` }}
                            title={`${label}: ${count}`}
                        />
                    )
                })}
            </div>

            <dl className="dash-legend">
                {ROOM_STATUS.map(({ key, label, modifier }) => (
                    <div key={key} className="dash-legend-item">
                        <span className={`dash-legend-swatch ${modifier}`} aria-hidden="true" />
                        {label}
                        <span className="dash-legend-count">{rooms[key] || 0}</span>
                    </div>
                ))}
            </dl>
        </div>
    )
}
