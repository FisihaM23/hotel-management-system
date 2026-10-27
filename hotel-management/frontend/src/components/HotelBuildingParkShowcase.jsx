import React, { useState, useEffect } from 'react'
import { 
    Building2, Trees, Utensils, GlassWater, Crown, 
    Sparkles, BedDouble, Check, ArrowRight,
    Eye, Users
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getHotelBuildingFloors } from '../services/api'

export default function HotelBuildingParkShowcase({ onSelectRoom, onOpenAI }) {
    const [data, setData] = useState(null)
    const [activeFloor, setActiveFloor] = useState(1)
    const [activeGalleryTab, setActiveGalleryTab] = useState('building_park') // 'building_park' | 'dining' | 'refreshment'
    const [loading, setLoading] = useState(true)
    const [lang, setLang] = useState('en')

    useEffect(() => {
        getHotelBuildingFloors()
            .then(res => {
                setData(res.data)
            })
            .catch(err => {
                console.error('Failed to load building floors:', err)
            })
            .finally(() => setLoading(false))
    }, [])

    const floorIcons = {
        1: <Trees size={16} style={{ color: 'var(--tp-acc)' }} />,
        2: <Utensils size={16} style={{ color: '#f59e0b' }} />,
        3: <GlassWater size={16} style={{ color: '#06b6d4' }} />,
        4: <Building2 size={16} style={{ color: '#818cf8' }} />,
        5: <Sparkles size={16} style={{ color: '#c084fc' }} />,
        6: <Crown size={16} style={{ color: '#fbbf24' }} />
    }

    const currentFloorData = data?.floors?.find(f => f.floor === activeFloor) || data?.floors?.[0]

    const handleRoomBook = (room) => {
        toast.success(`Selected Room #${room.room_number} (Floor ${room.floor})!`)
        if (onSelectRoom) {
            onSelectRoom(room)
        } else {
            window.dispatchEvent(new CustomEvent('hotel-ai-book-room', { detail: { room } }))
        }
    }

    const handleAskAI = (prompt) => {
        if (onOpenAI) {
            onOpenAI(prompt)
        } else {
            window.dispatchEvent(new CustomEvent('open-hotel-ai', { detail: { query: prompt } }))
        }
    }

    return (
        <div className="hbps-card">
            {/* TOP HEADER WITH LANGUAGE TOGGLE */}
            <div className="hbps-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span className="hbps-tag">
                            <Building2 size={13} />
                            6-Floor Hospitality Architecture
                        </span>
                        <span className="hbps-tag" style={{ color: 'var(--tp-acc)' }}>
                            <Trees size={13} />
                            Resort Park & Gardens
                        </span>
                    </div>
                    <h2 className="hbps-title">
                        {lang === 'am' ? 'ታላቁ 6 ፎቅ ዓለም አቀፍ የሆቴል ህንፃ እና የሪዞርት ፓርክ' : 'Grand 6-Floor International Hospitality Building & Resort Park'}
                    </h2>
                    <p className="hbps-subtitle">
                        {lang === 'am'
                            ? 'ለዓለም አቀፍ እንግዶች መስተንግዶ፣ የመዝናኛ ፓርክ፣ ባህላዊና ዓለም አቀፍ ምግቦች (Feeding)፣ ማደሻ መጠጦች (Refreshment & Drinking) እና የቅንጦት ሱዊቶች የተዘጋጀ።'
                            : 'Dedicated to global hospitality: lush botanical resort park, international dining & feeding, craft refreshment & drinking lounges, executive suites, and panoramic sky penthouse.'}
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Bilingual Language Switcher */}
                    <div style={{
                        display: 'flex',
                        background: 'var(--tp-surf)',
                        border: '1px solid var(--tp-line)',
                        borderRadius: 8,
                        padding: 3,
                        gap: 4
                    }}>
                        <button
                            type="button"
                            onClick={() => setLang('en')}
                            style={{
                                padding: '5px 12px',
                                fontSize: 12,
                                fontWeight: 700,
                                borderRadius: 6,
                                border: 'none',
                                cursor: 'pointer',
                                background: lang === 'en' ? 'var(--tp-acc)' : 'transparent',
                                color: lang === 'en' ? 'var(--tp-acc-ink, #ffffff)' : 'var(--tp-mute)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            English
                        </button>
                        <button
                            type="button"
                            onClick={() => setLang('am')}
                            style={{
                                padding: '5px 12px',
                                fontSize: 12,
                                fontWeight: 700,
                                borderRadius: 6,
                                border: 'none',
                                cursor: 'pointer',
                                background: lang === 'am' ? 'var(--tp-acc)' : 'transparent',
                                color: lang === 'am' ? 'var(--tp-acc-ink, #ffffff)' : 'var(--tp-mute)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            አማርኛ
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => handleAskAI(lang === 'am' ? 'ስለ 6ቱ ፎቆች እና ስለ ሪዞርት ፓርኩ አብራራልኝ' : 'Explain the 6-floor hospitality building and resort park')}
                        className="btn btn-primary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px' }}
                    >
                        <Sparkles size={14} />
                        {lang === 'am' ? 'ሆቴል አይን ጠይቅ' : 'Ask Hotel AI'}
                    </button>
                </div>
            </div>

            {/* THREE FEATURED LIFESTYLE GALLERIES */}
            <div className="hbps-section" style={{ borderBottom: '1px solid var(--tp-line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tp-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Eye size={15} style={{ color: 'var(--tp-acc)' }} />
                        {lang === 'am' ? 'የሆቴሉ ዋና ዋና ገጽታዎች' : 'Hospitality Experience Showcase'}
                    </h3>
                    <div className="hbps-gallery-nav">
                        <button
                            type="button"
                            onClick={() => setActiveGalleryTab('building_park')}
                            className={`hbps-tab-btn ${activeGalleryTab === 'building_park' ? 'active' : ''}`}
                        >
                            🏛️ {lang === 'am' ? '6 ፎቅ ህንፃ እና ፓርክ' : '6-Floor Building & Park'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveGalleryTab('dining')}
                            className={`hbps-tab-btn ${activeGalleryTab === 'dining' ? 'active' : ''}`}
                        >
                            🍽️ {lang === 'am' ? 'ምግብ (Feeding & Dining)' : 'Feeding & Dining'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveGalleryTab('refreshment')}
                            className={`hbps-tab-btn ${activeGalleryTab === 'refreshment' ? 'active' : ''}`}
                        >
                            🍹 {lang === 'am' ? 'መጠጥ (Refreshment & Drinks)' : 'Refreshment & Drinks'}
                        </button>
                    </div>
                </div>

                {/* ACTIVE PHOTO HERO */}
                <div style={{
                    position: 'relative',
                    borderRadius: 14,
                    overflow: 'hidden',
                    border: '1px solid var(--tp-line)',
                    maxHeight: 380,
                    aspectRatio: '21 / 9',
                    background: '#090d16'
                }}>
                    <img 
                        src={
                            activeGalleryTab === 'building_park' 
                                ? '/images/hotel_building_park.jpg' 
                                : activeGalleryTab === 'dining' 
                                ? '/images/guests_dining_feeding.jpg' 
                                : '/images/guests_refreshment_drinking.jpg'
                        }
                        alt="Hospitality Showcase"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block'
                        }}
                    />
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.1) 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        padding: '24px'
                    }}>
                        {activeGalleryTab === 'building_park' && (
                            <div>
                                <span style={{
                                    display: 'inline-block',
                                    padding: '3px 10px',
                                    borderRadius: 6,
                                    background: 'var(--tp-acc)',
                                    color: 'var(--tp-acc-ink, #ffffff)',
                                    fontSize: 10.5,
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em',
                                    marginBottom: 8
                                }}>
                                    Resort Park & 6-Floor Building Architecture
                                </span>
                                <h3 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                    {lang === 'am' ? 'ግዙፉ 6 ፎቅ ህንፃ እና ለምለም የመዝናኛ ፓርክ' : 'Grand 6-Floor Resort & Botanical Garden Park'}
                                </h3>
                                <p style={{ fontSize: 13, color: '#f1f5f9', marginTop: 4, maxWidth: 640, textShadow: '0 1px 3px rgba(0,0,0,0.8)', lineHeight: 1.5 }}>
                                    {lang === 'am'
                                        ? 'በፏፏቴዎች፣ በእግር መሄጃ መንገዶች፣ በዘመናዊ አቀባበል እና ውብ የአትክልት ስፍራ የተከበበ ዓለም አቀፍ ሪዞርት።'
                                        : 'A magnificent international resort surrounded by lush palm pathways, illuminated fountains, outdoor gazebos, and luxury hotel rooms.'}
                                </p>
                            </div>
                        )}
                        {activeGalleryTab === 'dining' && (
                            <div>
                                <span style={{
                                    display: 'inline-block',
                                    padding: '3px 10px',
                                    borderRadius: 6,
                                    background: '#d97706',
                                    color: '#ffffff',
                                    fontSize: 10.5,
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em',
                                    marginBottom: 8
                                }}>
                                    Floor 2 • International Feeding & Traditional Banquet
                                </span>
                                <h3 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                    {lang === 'am' ? 'ዓለም አቀፍ እና ባህላዊ የምግብ አዳራሽ (Feeding & Dining)' : 'World-Class Feeding & Gourmet Dining Hall'}
                                </h3>
                                <p style={{ fontSize: 13, color: '#f1f5f9', marginTop: 4, maxWidth: 640, textShadow: '0 1px 3px rgba(0,0,0,0.8)', lineHeight: 1.5 }}>
                                    {lang === 'am'
                                        ? 'የተለያዩ ዓለም አቀፍ እንግዶች በጋራ የሚመገቡበት፣ ባህላዊ የኢትዮጵያ ምግቦች እና ፕራይም እስቴይክ የሚቀርብበት አዳራሽ።'
                                        : 'International hotel guests enjoying signature prime steaks, Ethiopian clay-pot banquet stews, and breakfast buffets.'}
                                </p>
                            </div>
                        )}
                        {activeGalleryTab === 'refreshment' && (
                            <div>
                                <span style={{
                                    display: 'inline-block',
                                    padding: '3px 10px',
                                    borderRadius: 6,
                                    background: '#0284c7',
                                    color: '#ffffff',
                                    fontSize: 10.5,
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em',
                                    marginBottom: 8
                                }}>
                                    Floor 3 • Refreshment, Cocktail & Coffee Lounge
                                </span>
                                <h3 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                    {lang === 'am' ? 'የማደሻ መጠጦች እና የኮክቴል ላውንጅ (Refreshment & Drinking)' : 'Chic Refreshment Bar & Botanical Park View Lounge'}
                                </h3>
                                <p style={{ fontSize: 13, color: '#f1f5f9', marginTop: 4, maxWidth: 640, textShadow: '0 1px 3px rgba(0,0,0,0.8)', lineHeight: 1.5 }}>
                                    {lang === 'am'
                                        ? 'እንግዶች ቀዝቃዛ ቢራ፣ ልዩ ኮክቴሎችን፣ የተፈጥሮ ጭማቂዎችን እና የኢትዮጵያ ቡናን የሚጋሩበት ምቹ ቦታ።'
                                        : 'Global travelers relaxing with artisanal cocktails, draft beers, layered mango-avocado juices, and fresh Arabica coffee.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 6-FLOOR DIRECTORY & ROOM SELECTOR */}
            <div className="hbps-section">
                <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tp-acc)', display: 'block', marginBottom: 4 }}>
                        {lang === 'am' ? 'የፎቆች መመሪያ' : 'Floor-by-Floor Directory'}
                    </span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--tp-ink)' }}>
                        {lang === 'am' ? 'ከፎቅ 1 እስከ ፎቅ 6 ያለውን መስተንግዶ ይምረጡ' : 'Select a Floor (Floors 1 to 6) to Explore Services & Available Rooms'}
                    </h3>
                </div>

                {/* FLOOR SELECTOR BUTTONS */}
                <div className="hbps-floor-grid">
                    {[1, 2, 3, 4, 5, 6].map((fl) => {
                        const floorObj = data?.floors?.find(f => f.floor === fl)
                        const count = floorObj?.rooms?.length || 0
                        const isCurrent = activeFloor === fl

                        return (
                            <button
                                key={fl}
                                type="button"
                                onClick={() => setActiveFloor(fl)}
                                className={`hbps-floor-btn ${isCurrent ? 'active' : ''}`}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                    <span className="hbps-floor-badge">
                                        F{fl}
                                    </span>
                                    {floorIcons[fl]}
                                </div>
                                <div className="hbps-floor-name">
                                    {fl === 1 && (lang === 'am' ? 'ፓርክና ሎቢ' : 'Lobby & Park')}
                                    {fl === 2 && (lang === 'am' ? 'ምግብና ድግስ' : 'Dining Plaza')}
                                    {fl === 3 && (lang === 'am' ? 'ማደሻ መጠጥ' : 'Bar & Lounge')}
                                    {fl === 4 && (lang === 'am' ? 'ዴሉክስ ሱዊት' : 'Deluxe Suites')}
                                    {fl === 5 && (lang === 'am' ? 'ቪአይፒ ስፓ' : 'VIP & Spa')}
                                    {fl === 6 && (lang === 'am' ? 'ሰማይ ፔንትሀውስ' : 'Sky Penthouse')}
                                </div>
                                <div className="hbps-floor-count">
                                    {count} {lang === 'am' ? 'ክፍሎች' : 'Rooms'}
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* CURRENT ACTIVE FLOOR DETAILS & ROOMS */}
                {currentFloorData && (
                    <div className="hbps-detail-card">
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            marginBottom: 16,
                            paddingBottom: 16,
                            borderBottom: '1px solid var(--tp-line)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <h4 className="hbps-floor-desc-title">
                                            {lang === 'am' ? currentFloorData.name_am : currentFloorData.name_en}
                                        </h4>
                                        <span style={{
                                            fontSize: 11,
                                            fontWeight: 800,
                                            padding: '2px 8px',
                                            borderRadius: 6,
                                            background: 'var(--tp-surf)',
                                            color: 'var(--tp-acc)',
                                            border: '1px solid var(--tp-line)'
                                        }}>
                                            Floor {currentFloorData.floor}
                                        </span>
                                    </div>
                                    <div className="hbps-floor-purpose">
                                        {lang === 'am' ? currentFloorData.purpose_am : currentFloorData.purpose_en}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleAskAI(lang === 'am' ? `ስለ ፎቅ ${currentFloorData.floor} እና ስለ ክፍሎቹ ንገረኝ` : `Tell me about Floor ${currentFloorData.floor} facilities and available rooms`)}
                                    className="btn btn-outline btn-sm"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                                >
                                    <Sparkles size={13} style={{ color: 'var(--tp-acc)' }} />
                                    {lang === 'am' ? `ስለ ፎቅ ${currentFloorData.floor} AIን ጠይቅ` : `Ask AI About Floor ${currentFloorData.floor}`}
                                </button>
                            </div>

                            {/* Crisp, high-contrast floor content explanation */}
                            <p className="hbps-floor-desc">
                                {lang === 'am' ? currentFloorData.description_am : currentFloorData.description_en}
                            </p>
                        </div>

                        {/* HIGHLIGHTS */}
                        {currentFloorData.highlights && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                                {currentFloorData.highlights.map((hl, i) => (
                                    <span 
                                        key={i}
                                        style={{
                                            fontSize: 11.5,
                                            fontWeight: 600,
                                            background: 'var(--tp-surf)',
                                            color: 'var(--tp-ink)',
                                            border: '1px solid var(--tp-line)',
                                            padding: '4px 10px',
                                            borderRadius: 20,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6
                                        }}
                                    >
                                        <Check size={13} style={{ color: 'var(--tp-acc)' }} />
                                        {hl}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* ROOMS LIST ON THIS FLOOR */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: 13,
                                    fontWeight: 800,
                                    color: 'var(--tp-ink)'
                                }}>
                                    <BedDouble size={16} style={{ color: 'var(--tp-acc)' }} />
                                    {lang === 'am' ? `በፎቅ ${currentFloorData.floor} የሚገኙ ክፍሎች (${currentFloorData.rooms?.length || 0})` : `Rooms Available on Floor ${currentFloorData.floor} (${currentFloorData.rooms?.length || 0})`}
                                </span>
                            </div>

                            {(!currentFloorData.rooms || currentFloorData.rooms.length === 0) ? (
                                <p style={{ fontSize: 13, color: 'var(--tp-mute)', padding: '12px 0' }}>
                                    {lang === 'am' ? 'በዚህ ፎቅ ላይ በአሁኑ ወቅት የተመዘገበ ክፍል የለም።' : 'No rooms currently configured on this floor.'}
                                </p>
                            ) : (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                                    gap: 12
                                }}>
                                    {currentFloorData.rooms.map((room) => (
                                        <div 
                                            key={room.id}
                                            className="hbps-room-card"
                                        >
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <span style={{ fontWeight: 800, color: 'var(--tp-ink)', fontSize: 14 }}>
                                                        {lang === 'am' ? `ክፍል #${room.room_number}` : `Room #${room.room_number}`}
                                                    </span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{
                                                            fontSize: 10,
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.04em',
                                                            padding: '2px 8px',
                                                            borderRadius: 4,
                                                            background: (room.status === 'occupied' || Number(room.is_booked) === 1 || room.status === 'booked') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                                            color: (room.status === 'occupied' || Number(room.is_booked) === 1 || room.status === 'booked') ? '#ef4444' : '#22c55e',
                                                            border: `1px solid ${(room.status === 'occupied' || Number(room.is_booked) === 1 || room.status === 'booked') ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`
                                                        }}>
                                                            {(room.status === 'occupied' || Number(room.is_booked) === 1 || room.status === 'booked')
                                                                ? (lang === 'am' ? 'የተያዘ (Occupied)' : 'Occupied')
                                                                : (lang === 'am' ? 'ክፍት (Available)' : 'Available')}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 10,
                                                            fontWeight: 800,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.08em',
                                                            padding: '2px 8px',
                                                            borderRadius: 4,
                                                            background: 'var(--tp-surf-2)',
                                                            color: 'var(--tp-acc)',
                                                            border: '1px solid var(--tp-line)'
                                                        }}>
                                                            {room.type}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 8 }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--tp-mute)', fontWeight: 600 }}>
                                                        <Users size={13} /> max {room.max_guests} guests
                                                    </span>
                                                    <span style={{ color: 'var(--tp-line)' }}>•</span>
                                                    <span style={{ color: 'var(--tp-acc)', fontWeight: 800 }}>
                                                        ${room.price_per_night}/night
                                                    </span>
                                                </div>

                                                {room.description && (
                                                    <p style={{
                                                        fontSize: 12,
                                                        color: 'var(--tp-mute)',
                                                        lineHeight: 1.5,
                                                        marginBottom: 8,
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden'
                                                    }}>
                                                        {room.description}
                                                    </p>
                                                )}

                                                {room.amenities && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                                                        {room.amenities.slice(0, 3).map((am, i) => (
                                                            <span key={i} style={{
                                                                fontSize: 10,
                                                                fontWeight: 600,
                                                                background: 'var(--tp-surf-2)',
                                                                color: 'var(--tp-ink)',
                                                                padding: '2px 6px',
                                                                borderRadius: 4,
                                                                border: '1px solid var(--tp-line)'
                                                            }}>
                                                                {am}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {(() => {
                                                const isBooked = room.status === 'occupied' || Number(room.is_booked) === 1 || room.status === 'booked';
                                                return isBooked ? (
                                                    <button
                                                        type="button"
                                                        disabled
                                                        className="btn btn-outline btn-sm"
                                                        style={{ width: '100%', justifyContent: 'center', padding: '8px 12px', opacity: 0.6, cursor: 'not-allowed' }}
                                                    >
                                                        {lang === 'am' ? 'የተያዘ (Occupied)' : 'Occupied'}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRoomBook(room)}
                                                        className="btn btn-primary btn-sm"
                                                        style={{ width: '100%', justifyContent: 'center', padding: '8px 12px' }}
                                                    >
                                                        {lang === 'am' ? 'ክፍት (Available)' : 'Available'}
                                                        <ArrowRight size={14} style={{ marginLeft: 6 }} />
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
