import React, { useState, useEffect } from 'react'
import { 
    Building2, Trees, Utensils, GlassWater, Crown, 
    Sparkles, BedDouble, Check, ArrowRight, ShieldCheck,
    Coffee, ChevronRight, Eye, Calendar, Users
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
        1: <Trees className="w-4 h-4 text-emerald-400" />,
        2: <Utensils className="w-4 h-4 text-amber-400" />,
        3: <GlassWater className="w-4 h-4 text-sky-400" />,
        4: <Building2 className="w-4 h-4 text-indigo-400" />,
        5: <Sparkles className="w-4 h-4 text-purple-400" />,
        6: <Crown className="w-4 h-4 text-amber-300" />
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
        <div className="card my-6 border border-sky-900/40 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white rounded-2xl overflow-hidden shadow-2xl">
            {/* TOP HEADER WITH LANGUAGE TOGGLE */}
            <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/70">
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-sky-400" />
                            6-Floor Hospitality Architecture
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <Trees className="w-3 h-3 text-emerald-400" />
                            Resort Park & Gardens
                        </span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                        {lang === 'am' ? 'ታላቁ 6 ፎቅ ዓለም አቀፍ የሆቴል ህንፃ እና የሪዞርት ፓርክ' : 'Grand 6-Floor International Hospitality Building & Resort Park'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                        {lang === 'am'
                            ? 'ለዓለም አቀፍ እንግዶች መስተንግዶ፣ የመዝናኛ ፓርክ፣ ባህላዊና ዓለም አቀፍ ምግቦች (Feeding)፣ ማደሻ መጠጦች (Refreshment & Drinking) እና የቅንጦት ሱዊቶች የተዘጋጀ።'
                            : 'Dedicated to global hospitality: lush botanical resort park, international dining & feeding, craft refreshment & drinking lounges, executive suites, and panoramic sky penthouse.'}
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center">
                        <button
                            type="button"
                            onClick={() => setLang('en')}
                            className={`px-2.5 py-1 text-xs font-bold rounded ${lang === 'en' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                        >
                            English
                        </button>
                        <button
                            type="button"
                            onClick={() => setLang('am')}
                            className={`px-2.5 py-1 text-xs font-bold rounded ${lang === 'am' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                        >
                            አማርኛ
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => handleAskAI(lang === 'am' ? 'ስለ 6ቱ ፎቆች እና ስለ ሪዞርት ፓርኩ አብራራልኝ' : 'Explain the 6-floor hospitality building and resort park')}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
                    >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        {lang === 'am' ? 'ሆቴል አይን ጠይቅ' : 'Ask Hotel AI'}
                    </button>
                </div>
            </div>

            {/* THREE FEATURED LIFESTYLE GALLERIES */}
            <div className="p-6 bg-slate-950/40">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                        <Eye className="w-4 h-4 text-sky-400" />
                        {lang === 'am' ? 'የሆቴሉ ዋና ዋና ገጽታዎች' : 'Hospitality Experience Showcase'}
                    </h3>
                    <div className="flex gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                        <button
                            onClick={() => setActiveGalleryTab('building_park')}
                            className={`px-2.5 py-1 rounded font-semibold transition-all ${activeGalleryTab === 'building_park' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            🏛️ {lang === 'am' ? '6 ፎቅ ህንፃ እና ፓርክ' : '6-Floor Building & Park'}
                        </button>
                        <button
                            onClick={() => setActiveGalleryTab('dining')}
                            className={`px-2.5 py-1 rounded font-semibold transition-all ${activeGalleryTab === 'dining' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            🍽️ {lang === 'am' ? 'ምግብ (Feeding & Dining)' : 'Feeding & Dining'}
                        </button>
                        <button
                            onClick={() => setActiveGalleryTab('refreshment')}
                            className={`px-2.5 py-1 rounded font-semibold transition-all ${activeGalleryTab === 'refreshment' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            🍹 {lang === 'am' ? 'መጠጥ (Refreshment & Drinks)' : 'Refreshment & Drinks'}
                        </button>
                    </div>
                </div>

                {/* ACTIVE PHOTO HERO */}
                <div className="relative rounded-2xl overflow-hidden border border-slate-800 aspect-[21/9] max-h-[380px] shadow-2xl group">
                    <img 
                        src={
                            activeGalleryTab === 'building_park' 
                                ? '/images/hotel_building_park.jpg' 
                                : activeGalleryTab === 'dining' 
                                ? '/images/guests_dining_feeding.jpg' 
                                : '/images/guests_refreshment_drinking.jpg'
                        }
                        alt="Hospitality Showcase"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent flex flex-col justify-end p-6">
                        {activeGalleryTab === 'building_park' && (
                            <div>
                                <span className="px-2.5 py-0.5 rounded bg-emerald-500/80 text-white text-[10px] font-bold uppercase tracking-wider mb-2 inline-block">
                                    Resort Park & 6-Floor Building Architecture
                                </span>
                                <h3 className="text-xl md:text-2xl font-black text-white">
                                    {lang === 'am' ? 'ግዙፉ 6 ፎቅ ህንፃ እና ለምለም የመዝናኛ ፓርክ' : 'Grand 6-Floor Resort & Botanical Garden Park'}
                                </h3>
                                <p className="text-xs text-slate-200 mt-1 max-w-xl">
                                    {lang === 'am'
                                        ? 'በፏፏቴዎች፣ በእግር መሄጃ መንገዶች፣ በዘመናዊ አቀባበል እና ውብ የአትክልት ስፍራ የተከበበ ዓለም አቀፍ ሪዞርት።'
                                        : 'A magnificent international resort surrounded by lush palm pathways, illuminated fountains, outdoor gazebos, and luxury hotel rooms.'}
                                </p>
                            </div>
                        )}
                        {activeGalleryTab === 'dining' && (
                            <div>
                                <span className="px-2.5 py-0.5 rounded bg-amber-500/80 text-slate-950 text-[10px] font-bold uppercase tracking-wider mb-2 inline-block">
                                    Floor 2 • International Feeding & Traditional Banquet
                                </span>
                                <h3 className="text-xl md:text-2xl font-black text-white">
                                    {lang === 'am' ? 'ዓለም አቀፍ እና ባህላዊ የምግብ አዳራሽ (Feeding & Dining)' : 'World-Class Feeding & Gourmet Dining Hall'}
                                </h3>
                                <p className="text-xs text-slate-200 mt-1 max-w-xl">
                                    {lang === 'am'
                                        ? 'የተለያዩ ዓለም አቀፍ እንግዶች በጋራ የሚመገቡበት፣ ባህላዊ የኢትዮጵያ ምግቦች እና ፕራይም እስቴይክ የሚቀርብበት አዳራሽ።'
                                        : 'International hotel guests enjoying signature prime steaks, Ethiopian clay-pot banquet stews, and breakfast buffets.'}
                                </p>
                            </div>
                        )}
                        {activeGalleryTab === 'refreshment' && (
                            <div>
                                <span className="px-2.5 py-0.5 rounded bg-sky-500/80 text-slate-950 text-[10px] font-bold uppercase tracking-wider mb-2 inline-block">
                                    Floor 3 • Refreshment, Cocktail & Coffee Lounge
                                </span>
                                <h3 className="text-xl md:text-2xl font-black text-white">
                                    {lang === 'am' ? 'የማደሻ መጠጦች እና የኮክቴል ላውንጅ (Refreshment & Drinking)' : 'Chic Refreshment Bar & Botanical Park View Lounge'}
                                </h3>
                                <p className="text-xs text-slate-200 mt-1 max-w-xl">
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
            <div className="p-6 border-t border-slate-800">
                <div className="mb-4">
                    <span className="text-xs font-bold text-sky-400 uppercase tracking-wider block mb-1">
                        {lang === 'am' ? 'የፎቆች መመሪያ' : 'Floor-by-Floor Directory'}
                    </span>
                    <h3 className="text-lg font-bold text-white">
                        {lang === 'am' ? 'ከፎቅ 1 እስከ ፎቅ 6 ያለውን መስተንግዶ ይምረጡ' : 'Select a Floor (Floors 1 to 6) to Explore Services & Available Rooms'}
                    </h3>
                </div>

                {/* FLOOR SELECTOR BUTTONS */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-6">
                    {[1, 2, 3, 4, 5, 6].map((fl) => {
                        const floorObj = data?.floors?.find(f => f.floor === fl)
                        const count = floorObj?.rooms?.length || 0
                        const isCurrent = activeFloor === fl

                        return (
                            <button
                                key={fl}
                                type="button"
                                onClick={() => setActiveFloor(fl)}
                                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                                    isCurrent 
                                        ? 'bg-sky-500/20 border-sky-400 text-white shadow-lg ring-1 ring-sky-400' 
                                        : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-black px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                                        F{fl}
                                    </span>
                                    {floorIcons[fl]}
                                </div>
                                <div className="font-bold text-xs text-white truncate">
                                    {fl === 1 && (lang === 'am' ? 'ፓርክና ሎቢ' : 'Lobby & Park')}
                                    {fl === 2 && (lang === 'am' ? 'ምግብና ድግስ' : 'Dining Plaza')}
                                    {fl === 3 && (lang === 'am' ? 'ማደሻ መጠጥ' : 'Bar & Lounge')}
                                    {fl === 4 && (lang === 'am' ? 'ዴሉክስ ሱዊት' : 'Deluxe Suites')}
                                    {fl === 5 && (lang === 'am' ? 'ቪአይፒ ስፓ' : 'VIP & Spa')}
                                    {fl === 6 && (lang === 'am' ? 'ሰማይ ፔንትሀውስ' : 'Sky Penthouse')}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-1">
                                    {count} {lang === 'am' ? 'ክፍሎች' : 'Rooms'}
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* CURRENT ACTIVE FLOOR DETAILS & ROOMS */}
                {currentFloorData && (
                    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-800">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black text-white">
                                        {lang === 'am' ? currentFloorData.name_am : currentFloorData.name_en}
                                    </span>
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                                        Floor {currentFloorData.floor}
                                    </span>
                                </div>
                                <p className="text-xs text-sky-300 font-medium mt-0.5">
                                    {lang === 'am' ? currentFloorData.purpose_am : currentFloorData.purpose_en}
                                </p>
                                <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                                    {lang === 'am' ? currentFloorData.description_am : currentFloorData.description_en}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => handleAskAI(lang === 'am' ? `ስለ ፎቅ ${currentFloorData.floor} እና ስለ ክፍሎቹ ንገረኝ` : `Tell me about Floor ${currentFloorData.floor} facilities and available rooms`)}
                                className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 font-bold text-xs border border-sky-500/40 transition-colors flex items-center gap-1.5 flex-shrink-0"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                {lang === 'am' ? `ስለ ፎቅ ${currentFloorData.floor} AIን ጠይቅ` : `Ask AI About Floor ${currentFloorData.floor}`}
                            </button>
                        </div>

                        {/* HIGHLIGHTS */}
                        {currentFloorData.highlights && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                {currentFloorData.highlights.map((hl, i) => (
                                    <span 
                                        key={i}
                                        className="text-[11px] bg-slate-950 text-slate-300 border border-slate-800 px-2.5 py-1 rounded-full flex items-center gap-1"
                                    >
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        {hl}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* ROOMS LIST ON THIS FLOOR */}
                        <div>
                            <div className="flex items-center justify-between mb-3 text-xs font-bold text-slate-300">
                                <span className="flex items-center gap-1.5">
                                    <BedDouble className="w-4 h-4 text-sky-400" />
                                    {lang === 'am' ? `በፎቅ ${currentFloorData.floor} የሚገኙ ክፍሎች (${currentFloorData.rooms?.length || 0})` : `Rooms Available on Floor ${currentFloorData.floor} (${currentFloorData.rooms?.length || 0})`}
                                </span>
                            </div>

                            {(!currentFloorData.rooms || currentFloorData.rooms.length === 0) ? (
                                <p className="text-xs text-slate-500 py-3">
                                    {lang === 'am' ? 'በዚህ ፎቅ ላይ በአሁኑ ወቅት የተመዘገበ ክፍል የለም።' : 'No rooms currently configured on this floor.'}
                                </p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {currentFloorData.rooms.map((room) => (
                                        <div 
                                            key={room.id}
                                            className="p-3.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-sky-500/40 transition-all flex flex-col justify-between"
                                        >
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-bold text-white text-sm">
                                                        {lang === 'am' ? `ክፍል #${room.room_number}` : `Room #${room.room_number}`}
                                                    </span>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                                                        {room.type}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1.5">
                                                    <span className="flex items-center gap-0.5"><Users className="w-3 h-3" /> max {room.max_guests}</span>
                                                    <span>•</span>
                                                    <span className="text-emerald-400 font-semibold">${room.price_per_night}/night</span>
                                                </div>
                                                {room.description && (
                                                    <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">
                                                        {room.description}
                                                    </p>
                                                )}
                                                {room.amenities && (
                                                    <div className="flex flex-wrap gap-1 mb-3">
                                                        {room.amenities.slice(0, 3).map((am, i) => (
                                                            <span key={i} className="text-[9px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded">
                                                                {am}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleRoomBook(room)}
                                                className="w-full py-1.5 px-3 rounded-lg bg-sky-500 text-slate-950 font-bold text-xs hover:bg-sky-400 transition-colors flex items-center justify-center gap-1"
                                            >
                                                {lang === 'am' ? `ክፍል #${room.room_number}ን ያሲዙ` : `Reserve Room #${room.room_number}`}
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </button>
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
