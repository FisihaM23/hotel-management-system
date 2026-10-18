import { formatMoney, formatNumber } from '../../utils/format'

/** Room inventory grouped by type, with live availability and average rate. */
export default function RoomTypes({ types = [] }) {
    if (types.length === 0) {
        return <p className="dash-rail-note">Nulla pariatur — no rooms configured yet.</p>
    }

    return (
        <div className="dash-types">
            {types.map(roomType => (
                <div key={roomType.type} className="dash-type">
                    <div style={{ minWidth: 0 }}>
                        <div className="dash-type-name">{roomType.label}</div>
                        <div className="dash-type-meta">
                            {formatNumber(roomType.available)} of {formatNumber(roomType.total)} ready
                        </div>
                    </div>
                    <div className="dash-type-price">
                        {formatMoney(roomType.avg_price)}
                        <span className="dash-type-meta"> /night</span>
                    </div>
                </div>
            ))}
        </div>
    )
}
