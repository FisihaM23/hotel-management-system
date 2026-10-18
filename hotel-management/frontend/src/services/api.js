import axios from 'axios'

const BASE = 'http://localhost/hotel-management/api'

const api = axios.create({
    baseURL: BASE,
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
})

// Attach token
api.interceptors.request.use(cfg => {
    const token = localStorage.getItem('hms_token')
    if (token) cfg.headers.Authorization = `Bearer ${token}`
    return cfg
})

// Only redirect on 401 for non-auth endpoints and when not already on an auth page
api.interceptors.response.use(
    res => res,
    err => {
        const url = err.config?.url || ''
        const isAuthCall = url.includes('auth.php') || url.includes('test_connection.php')
        const isAuthPage = typeof window !== 'undefined' && (
            window.location.pathname.startsWith('/login') ||
            window.location.pathname.startsWith('/register') ||
            window.location.pathname.startsWith('/forgot-password') ||
            window.location.pathname.startsWith('/reset-password')
        )
        if (err.response?.status === 401 && !isAuthCall && !isAuthPage) {
            localStorage.removeItem('hms_token')
            localStorage.removeItem('hms_user')
            window.location.href = '/login'
        }
        return Promise.reject(err)
    }
)

// Auth
export const login = d => api.post('/auth.php?action=login', d)
export const register = d => api.post('/auth.php?action=register', d)

// DB test
export const testConnection = () => api.get('/test_connection.php')

// Rooms
export const getRooms = (status) => api.get('/rooms.php' + (status ? `?status=${status}` : ''))
export const createRoom = d => api.post('/rooms.php', d)
export const updateRoom = (id, d) => api.put(`/rooms.php?id=${id}`, d)
export const deleteRoom = id => api.delete(`/rooms.php?id=${id}`)

// Users
export const getUsers = (role) => api.get('/users.php' + (role ? `?role=${role}` : ''))
export const createUser = d => api.post('/users.php', d)
export const updateUser = (id, d) => api.put(`/users.php?id=${id}`, d)
export const deleteUser = id => api.delete(`/users.php?id=${id}`)

// Guests
export const getGuests = (search) => api.get('/guests.php' + (search ? `?search=${search}` : ''))
export const createGuest = d => api.post('/guests.php', d)
export const updateGuest = (id, d) => api.put(`/guests.php?id=${id}`, d)
export const deleteGuest = id => api.delete(`/guests.php?id=${id}`)

// Bookings
export const getBookings = (status) => api.get('/bookings.php' + (status ? `?status=${status}` : ''))
export const getMyBookings = () => api.get('/bookings.php?mine=1')
export const createBooking = d => api.post('/bookings.php', d)
export const updateBooking = (id, d) => api.put(`/bookings.php?id=${id}`, d)
export const checkInBooking = (id, d) => api.put(`/bookings.php?id=${id}`, { ...d, action: 'check_in' })
export const checkOutBooking = (id, d) => api.put(`/bookings.php?id=${id}`, { ...d, action: 'check_out' })
export const deleteBooking = id => api.delete(`/bookings.php?id=${id}`)

// Payment Methods Constant
export const PAYMENT_METHODS = [
    { value: 'telebirr', label: 'Telebirr', icon: '📱' },
    { value: 'cbe_birr', label: 'CBE Birr (Commercial Bank of Ethiopia)', icon: '🏦' },
    { value: 'awash_birr', label: 'Awash Bank / Awash Birr', icon: '🏛️' },
    { value: 'boa', label: 'Bank of Abyssinia (BOA)', icon: '💳' },
    { value: 'cash', label: 'Cash', icon: '💵' },
    { value: 'card', label: 'Credit / Debit Card', icon: '💳' },
    { value: 'chapa', label: 'Chapa Online (Cards / Telebirr / CBE)', icon: '⚡' },
    { value: 'bank_transfer', label: 'Direct Bank Transfer', icon: '🔄' }
]

// Payments
export const getPayments = () => api.get('/payments.php')
export const getBookingPayments = id => api.get(`/payments.php?booking_id=${id}`)
export const createPayment = d => api.post('/payments.php', d)
export const updatePayment = (id, d) => api.put(`/payments.php?id=${id}`, d)

// Housekeeping
export const getHousekeepingTasks = (status) => api.get('/housekeeping.php' + (status ? `?status=${status}` : ''))
export const createHousekeepingTask = d => api.post('/housekeeping.php', d)
export const updateHousekeepingTask = (id, d) => api.put(`/housekeeping.php?id=${id}`, d)
export const deleteHousekeepingTask = id => api.delete(`/housekeeping.php?id=${id}`)

// Maintenance
export const getMaintenanceRequests = (status) => api.get('/maintenance.php' + (status ? `?status=${status}` : ''))
export const createMaintenanceRequest = d => api.post('/maintenance.php', d)
export const updateMaintenanceRequest = (id, d) => api.put(`/maintenance.php?id=${id}`, d)

// Dashboard
export const getDashboard = () => api.get('/dashboard.php')

// Reports
export const getReports = (type, from, to) => api.get(`/reports.php?type=${type}&from=${from}&to=${to}`)

// Invoices
export const getInvoices = () => api.get('/invoices.php')
export const getMyInvoices = () => api.get('/invoices.php')
export const createInvoice = d => api.post('/invoices.php', d)

// Notifications
export const getNotifications = () => api.get('/notifications.php')
export const markNotificationRead = id => api.put(`/notifications.php?id=${id}`)

export const getMyProfile = () => api.get('/profile.php');
export const updateMyProfile = data => api.put('/profile.php', data);

// Dining & Bar
export const getMenuItems = (params = {}) => {
    const q = new URLSearchParams()
    if (params.category) q.append('category', params.category)
    if (params.sub_category) q.append('sub_category', params.sub_category)
    if (params.search) q.append('search', params.search)
    const qs = q.toString()
    return api.get('/dining.php' + (qs ? `?${qs}` : ''))
}
export const getMenuItem = id => api.get(`/dining.php?id=${id}`)
export const createMenuItem = d => api.post('/dining.php', d)
export const updateMenuItem = (id, d) => api.put(`/dining.php?id=${id}`, d)
export const deleteMenuItem = id => api.delete(`/dining.php?id=${id}`)

export const getDiningOrders = () => api.get('/dining.php?action=orders')
export const createDiningOrder = d => api.post('/dining.php?action=create_order', d)
export const updateDiningOrderStatus = (id, d) => api.put(`/dining.php?action=update_order_status&id=${id}`, d)

// Chapa Payment Gateway
export const getChapaConfig = () => api.get('/chapa.php?action=config')
export const initializeChapaPayment = d => api.post('/chapa.php?action=initialize', d)
export const verifyChapaPayment = txRef => api.get(`/chapa.php?action=verify&tx_ref=${txRef}`)

export default api

