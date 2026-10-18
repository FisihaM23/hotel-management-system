export const CURRENCY = 'USD'

/** "$3,250" — for headline figures where cents are noise. */
export const formatMoney = value =>
    `$${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

/** "$3,250.00" — for ledger-accurate amounts. */
export const formatMoneyPrecise = value =>
    `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const formatNumber = value => Number(value || 0).toLocaleString('en-US')

export const formatPercent = value => `${Math.round(Number(value) || 0)}%`

/** "2026-10-10" becomes "10 Oct" — short, unambiguous, no timezone drift. */
export const formatShortDate = value => {
    if (!value) return '—'
    const parsed = new Date(`${value}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return '—'
    return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** "2026-10-10" becomes "Sat, 10 Oct 2026". */
export const formatLongDate = value => {
    if (!value) return '—'
    const parsed = new Date(`${value}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return '—'
    return parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

const MORNING_END_HOUR = 12
const AFTERNOON_END_HOUR = 17

/** Greeting for the local clock. */
export const greetingFor = date => {
    const hour = date.getHours()
    if (hour <= MORNING_END_HOUR - 1) return 'Good morning'
    if (hour <= AFTERNOON_END_HOUR - 1) return 'Good afternoon'
    return 'Good evening'
}

/** Clock reading for the live stamp. */
export const formatClock = date =>
    date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** "Tue, 10 Nov" for the live stamp. */
export const formatStampDate = date =>
    date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
