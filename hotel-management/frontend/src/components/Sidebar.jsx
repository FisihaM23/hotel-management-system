import { NavLink } from 'react-router-dom'
import {
    LayoutDashboard, BedDouble, Users, CalendarCheck,
    CreditCard, Sparkles, Wrench, ShieldCheck, BarChart3,
    Hotel, UserCircle, BookOpen, FileText
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const allNav = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'manager', 'receptionist', 'housekeeping', 'maintenance'] },
    { to: '/my-bookings', icon: BookOpen, label: 'My Bookings', roles: ['customer'] },
    { to: '/rooms', icon: BedDouble, label: 'Rooms', roles: ['admin', 'manager', 'receptionist'] },
    { to: '/guests', icon: Users, label: 'Guests', roles: ['admin', 'manager', 'receptionist'] },
    { to: '/bookings', icon: CalendarCheck, label: 'Bookings', roles: ['admin', 'manager', 'receptionist'] },
    { to: '/payments', icon: CreditCard, label: 'Payments', roles: ['admin', 'manager', 'receptionist'] },
    { to: '/housekeeping', icon: Sparkles, label: 'Housekeeping', roles: ['admin', 'manager', 'housekeeping'] },
    { to: '/maintenance', icon: Wrench, label: 'Maintenance', roles: ['admin', 'manager', 'maintenance'] },
    { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['admin', 'manager'] },
    { to: '/invoices', icon: FileText, label: 'Invoices', roles: ['admin', 'manager', 'receptionist'] },
    { to: '/users', icon: ShieldCheck, label: 'User Management', roles: ['admin'] },
]

const roleColors = {
    admin: '#ef4444', manager: '#8b5cf6', receptionist: '#3b82f6',
    customer: '#10b981', housekeeping: '#f59e0b', maintenance: '#6b7280'
}

export default function Sidebar() {
    const { user, logoutUser } = useAuth()
    const navItems = allNav.filter(n => n.roles.includes(user?.role))

    return (
        <div className="sidebar">
            <div className="sidebar-logo">
                <Hotel size={28} color="#3b82f6" />
                <div>
                    <h2>HotelMS</h2>
                    <span>Management System</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                {navItems.map(({ to, icon: Icon, label }) => (
                    <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                        <Icon size={18} />{label}
                    </NavLink>
                ))}
                <NavLink to="/profile" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                    <UserCircle size={18} />Profile
                </NavLink>
            </nav>

            <div className="sidebar-footer">
                <div style={{ marginBottom: 10 }}>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{user?.name}</div>
                    <span style={{
                        display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 10,
                        fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                        background: roleColors[user?.role] + '33', color: roleColors[user?.role]
                    }}>{user?.role}</span>
                </div>
                <button onClick={logoutUser} style={{
                    width: '100%', padding: '8px', background: 'transparent',
                    border: '1px solid #2d3748', borderRadius: 8, color: '#a0aec0',
                    cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}>Logout</button>
            </div>
        </div>
    )
}
