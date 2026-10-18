/** Booking status → display label + badge class + pipeline accent. */
export const BOOKING_STATUS = {
    pending: { label: 'Pending', badge: 'badge-warning', fill: 'is-pending' },
    confirmed: { label: 'Confirmed', badge: 'badge-info', fill: 'is-confirmed' },
    checked_in: { label: 'Checked in', badge: 'badge-success', fill: 'is-checked_in' },
    checked_out: { label: 'Checked out', badge: 'badge-gray', fill: 'is-checked_out' },
    cancelled: { label: 'Cancelled', badge: 'badge-danger', fill: 'is-cancelled' },
}

/** Order the booking pipeline is read in — the guest journey, not the alphabet. */
export const BOOKING_FLOW = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled']

export const bookingMeta = status => BOOKING_STATUS[status] || BOOKING_STATUS.pending

/** Room status → display label + meter/legend modifier. */
export const ROOM_STATUS = [
    { key: 'available', label: 'Available', modifier: 'is-available' },
    { key: 'occupied', label: 'Occupied', modifier: 'is-occupied' },
    { key: 'cleaning', label: 'Cleaning', modifier: 'is-cleaning' },
    { key: 'maintenance', label: 'Maintenance', modifier: 'is-maintenance' },
]

/** Which roles get the full operational dashboard. */
export const OPERATIONS_ROLES = ['admin', 'manager', 'receptionist']
