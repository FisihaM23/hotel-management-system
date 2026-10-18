import { useState, useEffect, useMemo } from 'react'
import {
    UtensilsCrossed, Wine, Coffee, Sparkles, Plus, Minus,
    Trash2, Search, Check, Clock, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react'
import { getMenuItems } from '../../services/api'

// Dining & Bar Need Types with matching category/sub_category patterns
export const DINING_NEED_TYPES = [
    {
        id: 'all',
        label: "Chef's Recommendations",
        icon: '🌟',
        desc: 'Top signature Ethiopian dishes, steaks & cocktails',
        badge: 'Recommended'
    },
    {
        id: 'breakfast',
        label: 'Breakfast & Morning',
        icon: '🍳',
        desc: 'Traditional Ethiopian breakfast, eggs, pastries & hot brews',
        badge: 'Morning'
    },
    {
        id: 'ethiopian',
        label: 'Traditional Ethiopian',
        icon: '🍲',
        desc: 'Special Shekla Tibs, Doro Wat, Kitfo, Asa Tilapia & injera',
        badge: 'Authentic'
    },
    {
        id: 'main_course',
        label: 'Main Courses & Steaks',
        icon: '🥩',
        desc: 'Prime Ribeye, Salmon, Alfredo pasta & wood-fired pizza',
        badge: 'Gourmet'
    },
    {
        id: 'vegetarian',
        label: 'Vegetarian & Fasting (የጾም)',
        icon: '🌱',
        desc: 'Yetsom Beyaynetu vegan platter, Shiro Tegabino & Sambusa',
        badge: 'Vegan / Fasting'
    },
    {
        id: 'desserts',
        label: 'Desserts & Sweets',
        icon: '🍰',
        desc: 'Molten chocolate lava cake, artisan gelato & Tiramisu',
        badge: 'Sweet'
    },
    {
        id: 'alcohol',
        label: 'Bar & Alcoholic Drinks',
        icon: '🍷',
        desc: 'Craft cocktails, Habesha draft beer, wines & honey Tej',
        badge: 'Bar'
    },
    {
        id: 'soft_drinks',
        label: 'Soft Drinks & Juices',
        icon: '☕',
        desc: 'Bole coffee ceremony, mango juice, mocktails & sodas',
        badge: 'Refreshing'
    }
]

export default function BookingDiningSelector({
    selectedItems = [],
    onItemsChange,
    roomNumber = '',
    currency = 'ETB'
}) {
    const [isOpen, setIsOpen] = useState(selectedItems.length > 0)
    const [activeNeed, setActiveNeed] = useState('all')
    const [search, setSearch] = useState('')
    const [menu, setMenu] = useState([])
    const [loading, setLoading] = useState(false)
    const [deliveryTime, setDeliveryTime] = useState('On arrival / Check-in')
    const [diningNotes, setDiningNotes] = useState('')

    // Fetch available menu items
    useEffect(() => {
        let isMounted = true
        setLoading(true)
        getMenuItems()
            .then(res => {
                if (isMounted) {
                    setMenu(res.data || [])
                }
            })
            .catch(() => {
                // If API fails or unauthenticated, menu stays empty
            })
            .finally(() => {
                if (isMounted) setLoading(false)
            })
        return () => { isMounted = false }
    }, [])

    // Filter and recommend items based on selected need type
    const recommendedItems = useMemo(() => {
        if (!menu || menu.length === 0) return []

        return menu.filter(item => {
            // Must be available
            if (item.is_available === 0 || item.is_available === '0') return false

            // Search filter
            if (search.trim()) {
                const s = search.toLowerCase()
                const matches = (
                    item.name?.toLowerCase().includes(s) ||
                    item.description?.toLowerCase().includes(s) ||
                    item.sub_category?.toLowerCase().includes(s) ||
                    item.category?.toLowerCase().includes(s)
                )
                if (!matches) return false
            }

            const cat = item.category || ''
            const sub = (item.sub_category || '').toLowerCase()
            const name = (item.name || '').toLowerCase()

            switch (activeNeed) {
                case 'breakfast':
                    return sub.includes('breakfast') || sub.includes('starter') || sub.includes('coffee') || sub.includes('juice')
                case 'ethiopian':
                    return sub.includes('ethiopian') || sub.includes('tibs') || sub.includes('stew') || sub.includes('kitfo') || sub.includes('fish') || sub.includes('tej')
                case 'main_course':
                    return cat === 'food' && (sub.includes('main') || sub.includes('tibs') || sub.includes('steak') || name.includes('salmon') || name.includes('pizza') || name.includes('pasta'))
                case 'vegetarian':
                    return sub.includes('vegetarian') || sub.includes('fasting') || name.includes('shiro') || name.includes('vegan') || name.includes('salad')
                case 'desserts':
                    return sub.includes('dessert') || name.includes('cake') || name.includes('tiramisu') || name.includes('ice')
                case 'alcohol':
                    return cat === 'alcoholic_drink' || sub.includes('beer') || sub.includes('wine') || sub.includes('cocktail') || sub.includes('spirit') || sub.includes('tej')
                case 'soft_drinks':
                    return cat === 'soft_drink' || sub.includes('juice') || sub.includes('coffee') || sub.includes('tea') || sub.includes('smoothie') || sub.includes('mocktail') || sub.includes('water')
                case 'all':
                default:
                    // Curated recommendations (famous / high rated items)
                    return (
                        sub.includes('tibs') ||
                        sub.includes('breakfast') ||
                        sub.includes('cocktails') ||
                        sub.includes('main') ||
                        sub.includes('dessert') ||
                        sub.includes('coffee') ||
                        sub.includes('beer') ||
                        sub.includes('vegetarian')
                    )
            }
        })
    }, [menu, activeNeed, search])

    // Calculate dining subtotal
    const diningTotal = useMemo(() => {
        return selectedItems.reduce((sum, item) => sum + (Number(item.price || 0) * (Number(item.qty) || 1)), 0)
    }, [selectedItems])

    // Notify parent whenever selected items or options change
    const updateParent = (newItems, newTime = deliveryTime, newNotes = diningNotes) => {
        const total = newItems.reduce((sum, item) => sum + (Number(item.price || 0) * (Number(item.qty) || 1)), 0)
        if (onItemsChange) {
            onItemsChange({
                items: newItems,
                total: total,
                deliveryTime: newTime,
                diningNotes: newNotes
            })
        }
    }

    const handleAddItem = (item) => {
        const exists = selectedItems.find(i => Number(i.id) === Number(item.id))
        let newItems
        if (exists) {
            newItems = selectedItems.map(i =>
                Number(i.id) === Number(item.id)
                    ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * Number(i.price) }
                    : i
            )
        } else {
            newItems = [
                ...selectedItems,
                {
                    id: Number(item.id),
                    name: item.name,
                    price: Number(item.price),
                    qty: 1,
                    subtotal: Number(item.price),
                    image_url: item.image_url,
                    category: item.category,
                    sub_category: item.sub_category
                }
            ]
        }
        updateParent(newItems)
    }

    const handleRemoveItem = (itemId) => {
        const newItems = selectedItems.filter(i => Number(i.id) !== Number(itemId))
        updateParent(newItems)
    }

    const handleUpdateQty = (itemId, delta) => {
        const item = selectedItems.find(i => Number(i.id) === Number(itemId))
        if (!item) return
        const newQty = item.qty + delta
        if (newQty <= 0) {
            handleRemoveItem(itemId)
            return
        }
        const newItems = selectedItems.map(i =>
            Number(i.id) === Number(itemId)
                ? { ...i, qty: newQty, subtotal: newQty * Number(i.price) }
                : i
        )
        updateParent(newItems)
    }

    const getItemCount = (itemId) => {
        const found = selectedItems.find(i => Number(i.id) === Number(itemId))
        return found ? found.qty : 0
    }

    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: isOpen ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            transition: 'all 0.25s ease'
        }}>
            {/* Header Toggle */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none'
                }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                    }}>
                        🍽️
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ fontSize: 14, color: '#f8fafc' }}>
                                Pre-order Food & Drinks for this Stay
                            </strong>
                            <span style={{
                                fontSize: 10,
                                textTransform: 'uppercase',
                                padding: '2px 7px',
                                borderRadius: 12,
                                fontWeight: 700,
                                background: 'rgba(56, 189, 248, 0.15)',
                                color: '#38bdf8'
                            }}>
                                Optional
                            </span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
                            Show dining & bar types, get chef recommendations, and add food price to your booking
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {selectedItems.length > 0 && (
                        <span style={{
                            background: '#10b981',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 20,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5
                        }}>
                            ✓ {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} (+{currency} {diningTotal.toLocaleString()})
                        </span>
                    )}
                    <button
                        type="button"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>
            </div>

            {/* Accordion Content */}
            {isOpen && (
                <div style={{ marginTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 14 }}>

                    {/* Step 1: Select Food Need Type */}
                    <div style={{ marginBottom: 12 }}>
                        <label style={{
                            display: 'block',
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: '#38bdf8',
                            marginBottom: 8
                        }}>
                            1. Select Dining & Bar Need Type:
                        </label>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                            gap: 6
                        }}>
                            {DINING_NEED_TYPES.map(type => {
                                const active = activeNeed === type.id
                                return (
                                    <button
                                        key={type.id}
                                        type="button"
                                        onClick={() => setActiveNeed(type.id)}
                                        style={{
                                            padding: '8px 10px',
                                            borderRadius: 8,
                                            border: active ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                                            background: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                                            color: active ? '#38bdf8' : '#cbd5e1',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 3,
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 16 }}>{type.icon}</span>
                                            {active && <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 800 }}>✓</span>}
                                        </div>
                                        <span style={{ fontSize: 11.5, fontWeight: active ? 700 : 500, lineHeight: 1.2 }}>
                                            {type.label}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Step 2: Recommendations and Search */}
                    <div style={{ marginBottom: 14 }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 8,
                            flexWrap: 'wrap',
                            gap: 8
                        }}>
                            <label style={{
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: '#38bdf8',
                                margin: 0
                            }}>
                                2. Recommended Dishes & Drinks ({recommendedItems.length} available):
                            </label>

                            <div style={{ position: 'relative', width: 220 }}>
                                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search dishes, drinks..."
                                    style={{
                                        width: '100%',
                                        padding: '5px 10px 5px 30px',
                                        fontSize: 12,
                                        borderRadius: 20,
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        background: 'rgba(0,0,0,0.25)',
                                        color: '#fff'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Items Grid */}
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
                                ⏳ Loading chef's dining recommendations...
                            </div>
                        ) : recommendedItems.length === 0 ? (
                            <div style={{
                                textAlign: 'center',
                                padding: '20px',
                                background: 'rgba(0,0,0,0.15)',
                                borderRadius: 8,
                                color: '#94a3b8',
                                fontSize: 12
                            }}>
                                No food or drink items match this filter. Try selecting another dining category or clearing the search.
                            </div>
                        ) : (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                                gap: 10,
                                maxHeight: 290,
                                overflowY: 'auto',
                                paddingRight: 4
                            }}>
                                {recommendedItems.map(item => {
                                    const count = getItemCount(item.id)
                                    const isAlcoholic = item.category === 'alcoholic_drink'
                                    const isSoftDrink = item.category === 'soft_drink'

                                    return (
                                        <div
                                            key={item.id}
                                            style={{
                                                background: count > 0 ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 23, 42, 0.65)',
                                                border: count > 0 ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                                                borderRadius: 10,
                                                padding: 10,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'space-between',
                                                position: 'relative',
                                                transition: 'transform 0.15s ease, border-color 0.15s ease'
                                            }}
                                        >
                                            <div>
                                                {/* Image and Badges */}
                                                <div style={{
                                                    height: 100,
                                                    borderRadius: 8,
                                                    overflow: 'hidden',
                                                    position: 'relative',
                                                    background: '#1e293b',
                                                    marginBottom: 8
                                                }}>
                                                    {item.image_url ? (
                                                        <img
                                                            src={item.image_url}
                                                            alt={item.name}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            onError={e => { e.target.style.display = 'none' }}
                                                        />
                                                    ) : (
                                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
                                                            {isAlcoholic ? '🍷' : isSoftDrink ? '☕' : '🍲'}
                                                        </div>
                                                    )}

                                                    {/* Sub-category tag */}
                                                    <span style={{
                                                        position: 'absolute',
                                                        bottom: 4,
                                                        left: 4,
                                                        background: 'rgba(0,0,0,0.75)',
                                                        color: '#e2e8f0',
                                                        fontSize: 9.5,
                                                        fontWeight: 600,
                                                        padding: '2px 6px',
                                                        borderRadius: 4
                                                    }}>
                                                        {item.sub_category || item.category}
                                                    </span>

                                                    {item.alcohol_by_volume && (
                                                        <span style={{
                                                            position: 'absolute',
                                                            top: 4,
                                                            right: 4,
                                                            background: '#ef4444',
                                                            color: '#fff',
                                                            fontSize: 9,
                                                            fontWeight: 700,
                                                            padding: '2px 5px',
                                                            borderRadius: 4
                                                        }}>
                                                            {item.alcohol_by_volume}% ABV
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Title and description */}
                                                <div style={{ fontWeight: 600, fontSize: 13, color: '#f8fafc', lineHeight: 1.3, marginBottom: 4 }}>
                                                    {item.name}
                                                </div>
                                                <p style={{
                                                    fontSize: 11,
                                                    color: '#94a3b8',
                                                    margin: '0 0 8px',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden'
                                                }}>
                                                    {item.description || 'Freshly prepared by our hotel kitchen and bar.'}
                                                </p>
                                            </div>

                                            {/* Price & Action */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                                                paddingTop: 8,
                                                marginTop: 4
                                            }}>
                                                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#38bdf8' }}>
                                                    {currency} {Number(item.price).toLocaleString()}
                                                </span>

                                                {count > 0 ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateQty(item.id, -1)}
                                                            style={{
                                                                width: 24,
                                                                height: 24,
                                                                borderRadius: 6,
                                                                border: '1px solid rgba(255,255,255,0.2)',
                                                                background: 'rgba(255,255,255,0.08)',
                                                                color: '#fff',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}
                                                        >
                                                            <Minus size={12} />
                                                        </button>
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', minWidth: 16, textAlign: 'center' }}>
                                                            {count}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateQty(item.id, 1)}
                                                            style={{
                                                                width: 24,
                                                                height: 24,
                                                                borderRadius: 6,
                                                                border: '1px solid rgba(56, 189, 248, 0.4)',
                                                                background: '#38bdf8',
                                                                color: '#0f172a',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddItem(item)}
                                                        style={{
                                                            padding: '4px 10px',
                                                            borderRadius: 6,
                                                            border: 'none',
                                                            background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                                                            color: '#fff',
                                                            fontSize: 11.5,
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 4
                                                        }}
                                                    >
                                                        <Plus size={13} /> Add
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Step 3: Selected Food Order Summary & Dining Preferences */}
                    {selectedItems.length > 0 && (
                        <div style={{
                            background: 'rgba(16, 185, 129, 0.08)',
                            border: '1.5px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: 10,
                            padding: 12
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 14 }}>📋</span>
                                    <strong style={{ fontSize: 12.5, color: '#34d399' }}>
                                        Selected Dining Pre-Orders ({selectedItems.length} items)
                                    </strong>
                                </div>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#34d399' }}>
                                    Food Subtotal: {currency} {diningTotal.toLocaleString()}
                                </span>
                            </div>

                            {/* Itemized List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                                {selectedItems.map(item => (
                                    <div
                                        key={item.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            fontSize: 12,
                                            padding: '4px 8px',
                                            background: 'rgba(0, 0, 0, 0.2)',
                                            borderRadius: 6
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontWeight: 600, color: '#f8fafc' }}>{item.name}</span>
                                            <span style={{ color: '#94a3b8' }}>× {item.qty}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                                                {currency} {(item.price * item.qty).toLocaleString()}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveItem(item.id)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#f87171',
                                                    cursor: 'pointer',
                                                    padding: 0
                                                }}
                                                title="Remove item"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Service Preferences */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 3 }}>
                                        Serving / Delivery Preference:
                                    </label>
                                    <select
                                        value={deliveryTime}
                                        onChange={e => {
                                            setDeliveryTime(e.target.value)
                                            updateParent(selectedItems, e.target.value, diningNotes)
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '6px 8px',
                                            fontSize: 11.5,
                                            borderRadius: 6,
                                            background: '#0f172a',
                                            color: '#fff',
                                            border: '1px solid rgba(255,255,255,0.15)'
                                        }}
                                    >
                                        <option value="On arrival / Check-in">🛎️ On arrival / Check-in</option>
                                        <option value="Daily morning breakfast (8:00 AM)">🌅 Daily morning breakfast (8:00 AM)</option>
                                        <option value="Evening dinner service (7:30 PM)">🌙 Evening dinner service (7:30 PM)</option>
                                        <option value="Room service on guest call">📦 Room service on guest call</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 3 }}>
                                        Kitchen Note / Dietary / Allergies:
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. extra injera, no onions, cold beer"
                                        value={diningNotes}
                                        onChange={e => {
                                            setDiningNotes(e.target.value)
                                            updateParent(selectedItems, deliveryTime, e.target.value)
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '6px 8px',
                                            fontSize: 11.5,
                                            borderRadius: 6,
                                            background: '#0f172a',
                                            color: '#fff',
                                            border: '1px solid rgba(255,255,255,0.15)'
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

