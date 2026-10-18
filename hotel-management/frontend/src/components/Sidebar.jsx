import { NavLink } from 'react-router-dom'
import {
    LayoutDashboard, BedDouble, Users, CalendarCheck,
    CreditCard, Sparkles, Wrench, ShieldCheck, BarChart3,
    Hotel, UserCircle, BookOpen, FileText, UtensilsCrossed, X
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const allNav = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'manager', 'receptionist', 'housekeeping', 'maintenance'] },
    { to: '/dining', icon: UtensilsCrossed, label: 'Dining & Bar', roles: ['admin', 'manager', 'receptionist', 'customer'] },
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

export default function Sidebar({ open = false, onNavigate }) {
    const { user, logoutUser } = useAuth()
    const navItems = allNav.filter(n => n.roles.includes(user?.role))
    const roleClass = `role-chip role-${user?.role || 'customer'}`

    return (
        <aside className={`sidebar${open ? ' open' : ''}`}>
            <div className="sidebar-logo">
                <Hotel size={26} color="var(--tp-acc)" aria-hidden="true" />
                <div style={{ minWidth: 0, flex: 1 }}>
                    <h2>HotelMS</h2>
                    <span>Management System</span>
                </div>
                <button
                    type="button"
                    className="sidebar-close"
                    onClick={onNavigate}
                    aria-label="Close navigation"
                >
                    <X size={18} />
                </button>
            </div>

            <nav className="sidebar-nav">
                {navItems.map(({ to, icon: Icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        onClick={onNavigate}
                        className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    >
                        <Icon size={17} aria-hidden="true" />
                        {label}
                    </NavLink>
                ))}
                <NavLink
                    to="/profile"
                    onClick={onNavigate}
                    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                    <UserCircle size={17} aria-hidden="true" />
                    Profile
                </NavLink>
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-user" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {user?.email === 'befather7@gmail.com' ? (
                        <div className="sidebar-dev-avatar-wrap">
                            <img
                                src="/mulugeta.jpg"
                                alt="Mulugeta Fisiha"
                                className="sidebar-dev-avatar"
                                onError={(e) => { e.target.style.display = 'none' }}
                            />
                        </div>
                    ) : null}
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="sidebar-user-name truncate">{user?.name}</div>
                        <span className={roleClass} style={{ marginTop: 4 }}>{user?.role}</span>
                    </div>
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={logoutUser} style={{ width: '100%' }}>
                    Logout
                </button>
            </div>
        </aside>
    )
}
