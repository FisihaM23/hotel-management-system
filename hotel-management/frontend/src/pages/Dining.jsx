import { useEffect, useState } from 'react'
import {
    UtensilsCrossed, Wine, Coffee, Plus, Pencil, Trash2,
    Search, ShoppingBag, Clock, Sparkles, CheckCircle2,
    X, ChevronRight, AlertCircle, GlassWater, ShieldAlert
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
    getMenuItems, createMenuItem, updateMenuItem, deleteMenuItem,
    getDiningOrders, createDiningOrder, updateDiningOrderStatus, getRooms
} from '../services/api'
import { useAuth } from '../context/AuthContext'

const categoryMeta = {
    all: { label: 'All Items', icon: Sparkles, color: '#3b82f6', bg: '#eff6ff' },
    ethiopian: { label: '🇪🇹 Ethiopian Traditional', icon: UtensilsCrossed, color: '#16a34a', bg: '#f0fdf4' },
    food: { label: 'Food & Cuisine', icon: UtensilsCrossed, color: '#f59e0b', bg: '#fffbeb' },
    alcoholic_drink: { label: 'Alcoholic Drinks & Bar', icon: Wine, color: '#ef4444', bg: '#fef2f2' },
    soft_drink: { label: 'Soft Drinks & Beverages', icon: Coffee, color: '#10b981', bg: '#f0fdf4' }
}

const emptyItemForm = {
    name: '',
    category: 'food',
    sub_category: 'Main Course',
    price: '',
    description: '',
    image_url: '',
    alcohol_by_volume: '',
    preparation_time: '15-20 mins',
    is_available: 1
}

const orderStatusBadge = {
    pending: 'badge-warning',
    preparing: 'badge-info',
    delivered: 'badge-success',
    cancelled: 'badge-danger'
}

export default function Dining() {
    const { user } = useAuth()
    const isStaff = ['admin', 'manager', 'receptionist'].includes(user?.role)
    const canManageMenu = ['admin', 'manager'].includes(user?.role)

    const [mainTab, setMainTab] = useState('menu') // 'menu' | 'orders'
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [selectedSubCategory, setSelectedSubCategory] = useState('All')
    const [search, setSearch] = useState('')
    const [items, setItems] = useState([])
    const [orders, setOrders] = useState([])
    const [rooms, setRooms] = useState([])
    const [loading, setLoading] = useState(true)

    // Cart state for orders
    const [cart, setCart] = useState([]) // array of { item, qty }
    const [cartDrawer, setCartDrawer] = useState(false)
    const [orderForm, setOrderForm] = useState({
        room_number: '',
        delivery_type: 'room_service',
        payment_status: 'charged_to_room',
        special_notes: ''
    })
    const [submittingOrder, setSubmittingOrder] = useState(false)

    // Menu Item Add/Edit Modal
    const [modal, setModal] = useState(false)
    const [editId, setEditId] = useState(null)
    const [itemForm, setItemForm] = useState(emptyItemForm)
    const [savingItem, setSavingItem] = useState(false)

    const loadData = () => {
        setLoading(true)
        Promise.all([
            getMenuItems(),
            getDiningOrders(),
            getRooms()
        ]).then(([menuRes, ordersRes, roomsRes]) => {
            setItems(menuRes.data || [])
            setOrders(ordersRes.data || [])
            setRooms(roomsRes.data || [])
        }).catch(() => {
            toast.error('Failed to load dining data')
        }).finally(() => {
            setLoading(false)
        })
    }

    useEffect(() => {
        loadData()
    }, [])

    const isEthiopianItem = (it) => {
        return (it.sub_category && it.sub_category.toLowerCase().includes('ethiopian')) ||
            it.name.includes('ወጥ') || it.name.includes('ጥብስ') || it.name.includes('ክትፎ') ||
            it.name.includes('ሽሮ') || it.name.includes('ጠጅ') || it.name.includes('ጠላ') ||
            it.name.includes('አረቄ') || it.name.includes('ቢራ') || it.name.includes('ቡና') ||
            it.name.includes('ጨጨብሳ') || it.name.includes('ቂንጬ') || it.name.includes('ገንፎ') ||
            it.name.includes('ፍርፍር') || it.name.includes('ዱለት') || it.name.includes('በየአይነቱ') ||
            it.name.includes('ጉላሽ') || it.name.includes('እስፕሪስ')
    }

    // Filter items based on active category, sub-category, and search query
    const filteredItems = items.filter(it => {
        const matchCat = selectedCategory === 'all'
            ? true
            : selectedCategory === 'ethiopian'
                ? isEthiopianItem(it)
                : it.category === selectedCategory
        const matchSub = selectedSubCategory === 'All' || it.sub_category === selectedSubCategory
        const matchSearch = !search ||
            it.name.toLowerCase().includes(search.toLowerCase()) ||
            it.description?.toLowerCase().includes(search.toLowerCase()) ||
            it.sub_category?.toLowerCase().includes(search.toLowerCase())
        return matchCat && matchSub && matchSearch
    })

    // Subcategories available under the current category
    const availableSubCategories = [
        'All',
        ...new Set(
            items
                .filter(it => {
                    if (selectedCategory === 'all') return true
                    if (selectedCategory === 'ethiopian') return isEthiopianItem(it)
                    return it.category === selectedCategory
                })
                .map(it => it.sub_category)
                .filter(Boolean)
        )
    ]

    // Cart actions
    const addToCart = (item) => {
        setCart(prev => {
            const existing = prev.find(i => i.item.id === item.id)
            if (existing) {
                return prev.map(i => i.item.id === item.id ? { ...i, qty: i.qty + 1 } : i)
            }
            return [...prev, { item, qty: 1 }]
        })
        toast.success(`Added ${item.name} to order`)
    }

    const updateCartQty = (itemId, delta) => {
        setCart(prev => {
            return prev
                .map(i => {
                    if (i.item.id === itemId) {
                        const newQty = i.qty + delta
                        return newQty > 0 ? { ...i, qty: newQty } : null
                    }
                    return i
                })
                .filter(Boolean)
        })
    }

    const cartTotal = cart.reduce((sum, i) => sum + (Number(i.item.price) * i.qty), 0)
    const cartCount = cart.reduce((sum, i) => sum + i.qty, 0)

    const handlePlaceOrder = async (e) => {
        e.preventDefault()
        if (cart.length === 0) return toast.error('Your order cart is empty')
        if (orderForm.delivery_type === 'room_service' && !orderForm.room_number) {
            return toast.error('Please specify your Room Number for room service')
        }

        setSubmittingOrder(true)
        try {
            const payload = {
                room_number: orderForm.room_number,
                delivery_type: orderForm.delivery_type,
                payment_status: orderForm.payment_status,
                special_notes: orderForm.special_notes,
                total_amount: cartTotal,
                items: cart.map(c => ({
                    id: c.item.id,
                    name: c.item.name,
                    price: c.item.price,
                    qty: c.qty,
                    subtotal: Number(c.item.price) * c.qty
                }))
            }
            await createDiningOrder(payload)
            toast.success('Your order has been placed successfully!')
            setCart([])
            setCartDrawer(false)
            loadData()
            setMainTab('orders')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to place order')
        } finally {
            setSubmittingOrder(false)
        }
    }

    // Menu Item CRUD
    const openAddItem = () => {
        setItemForm(emptyItemForm)
        setEditId(null)
        setModal(true)
    }

    const openEditItem = (item) => {
        setItemForm({
            name: item.name,
            category: item.category,
            sub_category: item.sub_category,
            price: item.price,
            description: item.description || '',
            image_url: item.image_url || '',
            alcohol_by_volume: item.alcohol_by_volume || '',
            preparation_time: item.preparation_time || '15 mins',
            is_available: Number(item.is_available)
        })
        setEditId(item.id)
        setModal(true)
    }

    const handleSaveItem = async (e) => {
        e.preventDefault()
        setSavingItem(true)
        try {
            if (editId) {
                await updateMenuItem(editId, itemForm)
                toast.success('Menu item updated')
            } else {
                await createMenuItem(itemForm)
                toast.success('Menu item added')
            }
            setModal(false)
            loadData()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save item')
        } finally {
            setSavingItem(false)
        }
    }

    const handleDeleteItem = async (id) => {
        if (!confirm('Are you sure you want to delete this menu item?')) return
        try {
            await deleteMenuItem(id)
            toast.success('Menu item deleted')
            loadData()
        } catch {
            toast.error('Failed to delete item')
        }
    }

    const handleUpdateOrderStatus = async (orderId, newStatus) => {
        try {
            await updateDiningOrderStatus(orderId, { status: newStatus })
            toast.success(`Order marked as ${newStatus}`)
            loadData()
        } catch {
            toast.error('Failed to update order status')
        }
    }

    return (
        <div>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: 20 }}>
                <div>
                    <h2>Dining & Bar</h2>
                    <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                        Fine Dining, Curated Cocktails & Premium Beverages
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {canManageMenu && (
                        <button className="btn btn-primary" onClick={openAddItem}>
                            <Plus size={16} />Add Menu Item
                        </button>
                    )}
                    <button
                        className="btn btn-outline"
                        style={{ position: 'relative', paddingRight: 16 }}
                        onClick={() => setCartDrawer(true)}
                    >
                        <ShoppingBag size={18} color="#1d4ed8" />
                        <span>Order Tray</span>
                        {cartCount > 0 && (
                            <span style={{
                                position: 'absolute', top: -6, right: -6,
                                background: '#ef4444', color: '#fff',
                                borderRadius: '50%', width: 20, height: 20,
                                fontSize: 11, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {cartCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Quick Metrics */}
            <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#dcfce7' }}><UtensilsCrossed color="#16a34a" /></div>
                    <div className="stat-info">
                        <h3>{items.filter(isEthiopianItem).length}</h3>
                        <p>Ethiopian Traditional</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#fef3c7' }}><UtensilsCrossed color="#d97706" /></div>
                    <div className="stat-info">
                        <h3>{items.filter(i => i.category === 'food').length}</h3>
                        <p>Total Food Items</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#fee2e2' }}><Wine color="#dc2626" /></div>
                    <div className="stat-info">
                        <h3>{items.filter(i => i.category === 'alcoholic_drink').length}</h3>
                        <p>Bar & Alcoholic Drinks</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#d1fae5' }}><Coffee color="#059669" /></div>
                    <div className="stat-info">
                        <h3>{items.filter(i => i.category === 'soft_drink').length}</h3>
                        <p>Soft Drinks & Coffee</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: '#ede9fe' }}><ShoppingBag color="#7c3aed" /></div>
                    <div className="stat-info">
                        <h3>{orders.filter(o => o.status === 'pending' || o.status === 'preparing').length}</h3>
                        <p>Active Orders</p>
                    </div>
                </div>
            </div>

            {/* Main Navigation Tabs: Menu vs Orders */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid #e5e7eb', paddingBottom: 10 }}>
                <button
                    onClick={() => setMainTab('menu')}
                    style={{
                        padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
                        fontWeight: 600, fontSize: 14,
                        background: mainTab === 'menu' ? '#1d4ed8' : '#f3f4f6',
                        color: mainTab === 'menu' ? '#fff' : '#4b5563',
                        display: 'flex', alignItems: 'center', gap: 8
                    }}
                >
                    <UtensilsCrossed size={16} /> Menu Catalog
                </button>
                <button
                    onClick={() => setMainTab('orders')}
                    style={{
                        padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
                        fontWeight: 600, fontSize: 14,
                        background: mainTab === 'orders' ? '#1d4ed8' : '#f3f4f6',
                        color: mainTab === 'orders' ? '#fff' : '#4b5563',
                        display: 'flex', alignItems: 'center', gap: 8
                    }}
                >
                    <ShoppingBag size={16} />
                    {isStaff ? 'Room Service Orders' : 'My Orders'}
                    {orders.length > 0 && (
                        <span style={{
                            background: mainTab === 'orders' ? '#fff' : '#e5e7eb',
                            color: mainTab === 'orders' ? '#1d4ed8' : '#374151',
                            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700
                        }}>
                            {orders.length}
                        </span>
                    )}
                </button>
            </div>

            {/* ─────────────────── TAB 1: MENU CATALOG ─────────────────── */}
            {mainTab === 'menu' && (
                <div>
                    {/* Category Selection Tabs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                        {Object.entries(categoryMeta).map(([catKey, cat]) => {
                            const IconComponent = cat.icon
                            const isSelected = selectedCategory === catKey
                            const count = catKey === 'all'
                                ? items.length
                                : catKey === 'ethiopian'
                                    ? items.filter(isEthiopianItem).length
                                    : items.filter(i => i.category === catKey).length
                            return (
                                <div
                                    key={catKey}
                                    onClick={() => {
                                        setSelectedCategory(catKey)
                                        setSelectedSubCategory('All')
                                    }}
                                    style={{
                                        padding: '14px 18px',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        border: isSelected ? `2px solid ${cat.color}` : '1px solid #e5e7eb',
                                        background: isSelected ? cat.bg : '#fff',
                                        boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.06)' : 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 10,
                                            background: cat.color + '22',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <IconComponent size={20} color={cat.color} />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{cat.label}</div>
                                            <div style={{ fontSize: 12, color: '#6b7280' }}>{count} items available</div>
                                        </div>
                                    </div>
                                    {isSelected && <CheckCircle2 size={18} color={cat.color} />}
                                </div>
                            )
                        })}
                    </div>

                    {/* Subcategories & Search */}
                    <div className="search-bar" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                        <div className="search-input-wrap" style={{ flex: 1, minWidth: 260 }}>
                            <Search size={16} />
                            <input
                                placeholder="Search dishes, wine, cocktails, sodas..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>

                        {/* Sub-category pills */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {availableSubCategories.map(sub => (
                                <button
                                    key={sub}
                                    onClick={() => setSelectedSubCategory(sub)}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: 20,
                                        border: selectedSubCategory === sub ? '1px solid #1d4ed8' : '1px solid #e5e7eb',
                                        background: selectedSubCategory === sub ? '#1d4ed8' : '#fff',
                                        color: selectedSubCategory === sub ? '#fff' : '#4b5563',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {sub}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Menu Items Grid */}
                    {loading ? (
                        <div className="loading"><div className="spinner" /> Loading delicious menu items...</div>
                    ) : filteredItems.length === 0 ? (
                        <div className="card empty-state" style={{ padding: 60 }}>
                            <UtensilsCrossed size={48} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                            <h3 style={{ marginBottom: 6, color: '#374151' }}>No menu items found</h3>
                            <p style={{ color: '#9ca3af', fontSize: 14 }}>Try adjusting your filters or search keywords</p>
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                            gap: 20
                        }}>
                            {filteredItems.map(item => (
                                <div
                                    key={item.id}
                                    style={{
                                        background: '#fff',
                                        borderRadius: 14,
                                        border: '1px solid #e5e7eb',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                        transition: 'transform 0.2s, box-shadow 0.2s'
                                    }}
                                >
                                    {/* Cover Image & Badges */}
                                    <div style={{ position: 'relative', width: '100%', height: 170, background: '#f3f4f6' }}>
                                        <img
                                            src={item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop'}
                                            alt={item.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={e => {
                                                e.target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop'
                                            }}
                                        />
                                        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
                                            <span style={{
                                                padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                                background: 'rgba(0,0,0,0.65)', color: '#fff', backdropFilter: 'blur(4px)'
                                            }}>
                                                {item.sub_category}
                                            </span>
                                            {item.alcohol_by_volume && (
                                                <span style={{
                                                    padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                                    background: 'rgba(220,38,38,0.85)', color: '#fff', backdropFilter: 'blur(4px)',
                                                    display: 'flex', alignItems: 'center', gap: 4
                                                }}>
                                                    <Wine size={11} /> {item.alcohol_by_volume}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ position: 'absolute', top: 10, right: 10 }}>
                                            <span style={{
                                                padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                background: item.is_available ? '#10b981' : '#6b7280', color: '#fff'
                                            }}>
                                                {item.is_available ? 'Available' : 'Sold Out'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Body */}
                                    <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                                            <h4 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>
                                                {item.name}
                                            </h4>
                                            <span style={{ fontSize: 17, fontWeight: 800, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                                                ETB {Number(item.price).toFixed(2)}
                                            </span>
                                        </div>

                                        <p style={{
                                            fontSize: 13, color: '#6b7280', margin: '0 0 14px 0',
                                            lineHeight: 1.45, flex: 1
                                        }}>
                                            {item.description}
                                        </p>

                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            paddingTop: 12, borderTop: '1px solid #f3f4f6', marginTop: 'auto'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#9ca3af' }}>
                                                <Clock size={13} />
                                                <span>{item.preparation_time || '15 mins'}</span>
                                            </div>

                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {canManageMenu && (
                                                    <>
                                                        <button
                                                            className="btn btn-outline btn-sm btn-icon"
                                                            onClick={() => openEditItem(item)}
                                                            title="Edit Item"
                                                        >
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button
                                                            className="btn btn-danger btn-sm btn-icon"
                                                            onClick={() => handleDeleteItem(item.id)}
                                                            title="Delete Item"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    disabled={!item.is_available}
                                                    onClick={() => addToCart(item)}
                                                    style={{ padding: '6px 12px', fontSize: 12 }}
                                                >
                                                    <ShoppingBag size={13} /> Order
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ─────────────────── TAB 2: ORDERS LIST ─────────────────── */}
            {mainTab === 'orders' && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontWeight: 700 }}>
                            {isStaff ? 'Room Service & Dining Orders' : 'My Dining History'}
                        </h3>
                        <button className="btn btn-outline btn-sm" onClick={loadData}>Refresh</button>
                    </div>

                    {orders.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
                            <ShoppingBag size={40} style={{ opacity: 0.3, margin: '0 auto 10px', display: 'block' }} />
                            <p>No orders placed yet</p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Order #</th>
                                        <th>Guest</th>
                                        <th>Room / Service</th>
                                        <th>Items Ordered</th>
                                        <th>Total</th>
                                        <th>Payment</th>
                                        <th>Status</th>
                                        {isStaff && <th>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map(ord => {
                                        let parsedItems = []
                                        try {
                                            parsedItems = typeof ord.items === 'string' ? JSON.parse(ord.items) : ord.items
                                        } catch { parsedItems = [] }

                                        return (
                                            <tr key={ord.id}>
                                                <td style={{ fontWeight: 700, color: '#1d4ed8' }}>
                                                    {ord.order_number}
                                                    <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>
                                                        {new Date(ord.created_at).toLocaleDateString()} {new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{ord.customer_name || 'Guest'}</div>
                                                    <div style={{ fontSize: 11, color: '#6b7280' }}>{ord.customer_phone || ord.customer_email}</div>
                                                </td>
                                                <td>
                                                    <span style={{
                                                        padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                        background: ord.delivery_type === 'room_service' ? '#dbeafe' : '#f3f4f6',
                                                        color: ord.delivery_type === 'room_service' ? '#1e40af' : '#4b5563'
                                                    }}>
                                                        {ord.delivery_type === 'room_service' ? `Room ${ord.room_number || 'N/A'}` : ord.delivery_type?.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td style={{ maxWidth: 240, fontSize: 13 }}>
                                                    {parsedItems.map((pi, idx) => (
                                                        <div key={idx} style={{ color: '#374151' }}>
                                                            <strong>{pi.qty}x</strong> {pi.name}
                                                        </div>
                                                    ))}
                                                    {ord.special_notes && (
                                                        <div style={{ fontSize: 11, color: '#d97706', marginTop: 4, fontStyle: 'italic' }}>
                                                            Note: {ord.special_notes}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
                                                    ETB {Number(ord.total_amount).toFixed(2)}
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: 12, textTransform: 'capitalize', color: ord.payment_status === 'paid' ? '#059669' : '#d97706', fontWeight: 600 }}>
                                                        {ord.payment_status?.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge ${orderStatusBadge[ord.status] || 'badge-gray'}`} style={{ textTransform: 'capitalize' }}>
                                                        {ord.status}
                                                    </span>
                                                </td>
                                                {isStaff && (
                                                    <td>
                                                        <select
                                                            value={ord.status}
                                                            onChange={e => handleUpdateOrderStatus(ord.id, e.target.value)}
                                                            className="form-control"
                                                            style={{ fontSize: 12, padding: '4px 8px', width: 130 }}
                                                        >
                                                            <option value="pending">Pending</option>
                                                            <option value="preparing">Preparing</option>
                                                            <option value="delivered">Delivered</option>
                                                            <option value="cancelled">Cancelled</option>
                                                        </select>
                                                    </td>
                                                )}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ─────────────────── SLIDE-OUT ORDER CART DRAWER ─────────────────── */}
            {cartDrawer && (
                <div
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        zIndex: 999, display: 'flex', justifyContent: 'flex-end'
                    }}
                    onClick={e => e.target === e.currentTarget && setCartDrawer(false)}
                >
                    <div style={{
                        width: '100%', maxWidth: 440, background: '#fff', height: '100%',
                        display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
                        animation: 'slideIn 0.2s ease-out'
                    }}>
                        {/* Drawer Header */}
                        <div style={{
                            padding: '18px 24px', borderBottom: '1px solid #e5e7eb',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <ShoppingBag size={20} color="#1d4ed8" />
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Your Dining Order</h3>
                            </div>
                            <button
                                onClick={() => setCartDrawer(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                            >
                                <X size={20} color="#6b7280" />
                            </button>
                        </div>

                        {/* Drawer Items */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                            {cart.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
                                    <ShoppingBag size={48} style={{ opacity: 0.25, margin: '0 auto 16px' }} />
                                    <h4 style={{ color: '#374151', marginBottom: 6 }}>Your order tray is empty</h4>
                                    <p style={{ fontSize: 13 }}>Browse the menu and click "Order" to add food and drinks</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    {cart.map(({ item, qty }) => (
                                        <div
                                            key={item.id}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '10px 12px', background: '#f9fafb', borderRadius: 10,
                                                border: '1px solid #f3f4f6'
                                            }}
                                        >
                                            <img
                                                src={item.image_url}
                                                alt={item.name}
                                                style={{ width: 50, height: 50, borderRadius: 8, objectFit: 'cover' }}
                                                onError={e => { e.target.style.display = 'none' }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                                                <div style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                                                    ETB {Number(item.price).toFixed(2)} each
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <button
                                                    onClick={() => updateCartQty(item.id, -1)}
                                                    style={{
                                                        width: 26, height: 26, borderRadius: '50%', border: '1px solid #d1d5db',
                                                        background: '#fff', cursor: 'pointer', fontWeight: 700
                                                    }}
                                                >
                                                    -
                                                </button>
                                                <span style={{ fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{qty}</span>
                                                <button
                                                    onClick={() => updateCartQty(item.id, 1)}
                                                    style={{
                                                        width: 26, height: 26, borderRadius: '50%', border: '1px solid #d1d5db',
                                                        background: '#fff', cursor: 'pointer', fontWeight: 700
                                                    }}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Order Delivery & Payment Form */}
                                    <form onSubmit={handlePlaceOrder} style={{ marginTop: 20 }}>
                                        <div className="form-group">
                                            <label className="form-label">Service Type</label>
                                            <select
                                                className="form-control"
                                                value={orderForm.delivery_type}
                                                onChange={e => setOrderForm({ ...orderForm, delivery_type: e.target.value })}
                                            >
                                                <option value="room_service">Room Service Delivery</option>
                                                <option value="restaurant_dine_in">Restaurant Dine-In</option>
                                                <option value="takeaway">Takeaway / Pick Up</option>
                                            </select>
                                        </div>

                                        {orderForm.delivery_type === 'room_service' && (
                                            <div className="form-group">
                                                <label className="form-label">Room Number *</label>
                                                <input
                                                    className="form-control"
                                                    placeholder="e.g. 101, 201, 301"
                                                    value={orderForm.room_number}
                                                    onChange={e => setOrderForm({ ...orderForm, room_number: e.target.value })}
                                                    required
                                                />
                                            </div>
                                        )}

                                        <div className="form-group">
                                            <label className="form-label">Payment Option</label>
                                            <select
                                                className="form-control"
                                                value={orderForm.payment_status}
                                                onChange={e => setOrderForm({ ...orderForm, payment_status: e.target.value })}
                                            >
                                                <option value="charged_to_room">Charge to Room Bill</option>
                                                <option value="paid">Pre-paid (Card / Cash)</option>
                                                <option value="unpaid">Pay on Delivery</option>
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Special Notes (optional)</label>
                                            <textarea
                                                className="form-control"
                                                rows={2}
                                                placeholder="e.g. Extra ice, medium-rare steak, wine glasses..."
                                                value={orderForm.special_notes}
                                                onChange={e => setOrderForm({ ...orderForm, special_notes: e.target.value })}
                                            />
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>

                        {/* Drawer Footer */}
                        {cart.length > 0 && (
                            <div style={{ padding: 24, borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                                    <span style={{ fontSize: 16, color: '#4b5563', fontWeight: 600 }}>Total Due</span>
                                    <span style={{ fontSize: 22, color: '#1d4ed8', fontWeight: 800 }}>
                                        ETB {cartTotal.toFixed(2)}
                                    </span>
                                </div>
                                <button
                                    className="btn btn-primary"
                                    style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 15 }}
                                    onClick={handlePlaceOrder}
                                    disabled={submittingOrder}
                                >
                                    {submittingOrder ? 'Placing Order...' : 'Confirm & Send to Kitchen'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─────────────────── ADD / EDIT MENU ITEM MODAL ─────────────────── */}
            {modal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
                    <div className="modal" style={{ maxWidth: 540 }}>
                        <div className="modal-header">
                            <h3>{editId ? 'Edit Menu Item' : 'Add New Food or Drink Item'}</h3>
                            <button className="btn btn-icon btn-outline" onClick={() => setModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSaveItem}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Item Name *</label>
                                        <input
                                            className="form-control"
                                            value={itemForm.name}
                                            onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                                            placeholder="e.g. Grilled Ribeye, Moët Champagne"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Category *</label>
                                        <select
                                            className="form-control"
                                            value={itemForm.category}
                                            onChange={e => {
                                                const cat = e.target.value
                                                const defaultSub = cat === 'food' ? 'Main Course' : cat === 'alcoholic_drink' ? 'Cocktails' : 'Juices'
                                                setItemForm({ ...itemForm, category: cat, sub_category: defaultSub })
                                            }}
                                        >
                                            <option value="food">Food & Cuisine</option>
                                            <option value="alcoholic_drink">Alcoholic Drink</option>
                                            <option value="soft_drink">Soft Drink & Beverage</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Sub-Category *</label>
                                        <input
                                            className="form-control"
                                            value={itemForm.sub_category}
                                            onChange={e => setItemForm({ ...itemForm, sub_category: e.target.value })}
                                            placeholder={itemForm.category === 'food' ? 'Main Course, Starters, Desserts' : itemForm.category === 'alcoholic_drink' ? 'Wine, Cocktails, Beer, Spirits' : 'Juices, Sodas, Coffee'}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Price (ETB) *</label>
                                        <input
                                            className="form-control"
                                            type="number"
                                            step="0.01"
                                            value={itemForm.price}
                                            onChange={e => setItemForm({ ...itemForm, price: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    {itemForm.category === 'alcoholic_drink' && (
                                        <div className="form-group">
                                            <label className="form-label">Alcohol Content (ABV)</label>
                                            <input
                                                className="form-control"
                                                value={itemForm.alcohol_by_volume}
                                                onChange={e => setItemForm({ ...itemForm, alcohol_by_volume: e.target.value })}
                                                placeholder="e.g. 13.5% ABV, 40% ABV"
                                            />
                                        </div>
                                    )}
                                    <div className="form-group">
                                        <label className="form-label">Prep Time</label>
                                        <input
                                            className="form-control"
                                            value={itemForm.preparation_time}
                                            onChange={e => setItemForm({ ...itemForm, preparation_time: e.target.value })}
                                            placeholder="e.g. 15 mins, Instant"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select
                                            className="form-control"
                                            value={itemForm.is_available}
                                            onChange={e => setItemForm({ ...itemForm, is_available: Number(e.target.value) })}
                                        >
                                            <option value={1}>Available</option>
                                            <option value={0}>Out of Stock</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Image URL</label>
                                    <input
                                        className="form-control"
                                        value={itemForm.image_url}
                                        onChange={e => setItemForm({ ...itemForm, image_url: e.target.value })}
                                        placeholder="https://images.unsplash.com/..."
                                    />
                                    {itemForm.image_url && (
                                        <div style={{ marginTop: 8, height: 100, borderRadius: 8, overflow: 'hidden' }}>
                                            <img
                                                src={itemForm.image_url}
                                                alt="preview"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={e => { e.target.style.display = 'none' }}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea
                                        className="form-control"
                                        rows={3}
                                        value={itemForm.description}
                                        onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                                        placeholder="Sensory tasting notes, ingredients, and presentation details..."
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={savingItem}>
                                    {savingItem ? 'Saving...' : editId ? 'Update Item' : 'Add Item'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

