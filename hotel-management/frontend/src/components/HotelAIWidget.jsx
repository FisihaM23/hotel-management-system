import React, { useState, useEffect, useRef } from 'react'
import { 
    Sparkles, Send, X, BedDouble, Utensils, 
    Calendar, Users, RotateCcw, 
    Minus, ArrowRight, ChevronUp, ChevronDown
} from 'lucide-react'
import toast from 'react-hot-toast'
import { chatHotelAI, getHotelAIHistory, clearHotelAIHistory } from '../services/api'
import { useAuth } from '../context/AuthContext'

const UI_TEXT = {
    en: {
        title: 'Hotel AI',
        status: 'Online',
        welcome: (name) => `Hello ${name}! 👋 I am **Hotel AI**.\nI predict free rooms and show available dining in short, clear answers.\n\n👉 What would you like to check?`,
        defaultSuggestions: [
            "Predict free rooms for 2 guests",
            "Which dining is available?",
            "What is check-in time?",
            "Show the 6 floors & park"
        ],
        placeholder: "Ask in EN or አማርኛ...",
        predictNow: "Predict",
        reserveRoom: (num) => `Book #${num}`,
        addToOrder: "+ Add",
        guaranteed: "100% Free",
        kitchenActive: "Kitchen Active",
        predictedRoomsLabel: "Free Rooms",
        availableDiningLabel: "Available Dining",
        loading: "Checking live hotel data...",
        error: "Connection issue. Please ask again in a moment!",
        resetConfirm: "Start a fresh chat with Hotel AI?"
    },
    am: {
        title: 'ሆቴል አይ',
        status: 'ዝግጁ ነው',
        welcome: (name) => `ሰላም ${name}! 👋 እኔ **ሆቴል አይ** ነኝ።\nበአጭር መልስ ክፍት ክፍሎችን እና ዝግጁ ምግቦችን ማሳወቅ እችላለሁ።\n\n👉 ምን ማወቅ ይፈልጋሉ?`,
        defaultSuggestions: [
            "ለ 2 ሰው ክፍት ክፍል አሳየኝ",
            "ምን አይነት ምግቦች አሉ?",
            "የመግቢያ ሰዓት ስንት ነው?",
            "የሆቴሉን 6 ፎቆች አሳየኝ"
        ],
        placeholder: "በአማርኛ ወይም በእንግሊዝኛ ይጠይቁ...",
        predictNow: "ፈልግ",
        reserveRoom: (num) => `ክፍል #${num}ን ያሲዙ`,
        addToOrder: "+ አዝዝ",
        guaranteed: "ክፍት ነው",
        kitchenActive: "ኩሽና ክፍት ነው",
        predictedRoomsLabel: "ክፍት ክፍሎች",
        availableDiningLabel: "ዝግጁ ምግቦችና መጠጦች",
        loading: "መረጃ እያዘጋጀ ነው...",
        error: "የግንኙነት ችግር አጋጥሟል። እባክዎ በድጋሚ ይሞክሩ!",
        resetConfirm: "ውይይቱን በአዲስ መልክ መጀመር ይፈልጋሉ?"
    }
}

export default function HotelAIWidget({ 
    isOpen: controlledIsOpen, 
    onToggle, 
    onSelectRoom, 
    onSelectDining, 
    initialDates = null 
}) {
    const { user } = useAuth()
    const isControlled = typeof controlledIsOpen === 'boolean'
    const [internalOpen, setInternalOpen] = useState(false)
    const isOpen = isControlled ? controlledIsOpen : internalOpen

    const setOpenState = (val) => {
        if (onToggle) {
            onToggle(val)
        } else {
            setInternalOpen(val)
        }
    }

    const [lang, setLang] = useState('en')
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [sessionId] = useState(() => 'session_' + Math.random().toString(36).substring(2, 10))
    const messagesEndRef = useRef(null)

    // Context for AI prediction
    const [context, setContext] = useState({
        check_in: initialDates?.check_in || '',
        check_out: initialDates?.check_out || '',
        guests: 1,
        room_type: '',
        lang: 'en'
    })

    const t = UI_TEXT[lang] || UI_TEXT.en
    const userName = user?.name ? user.name.split(' ')[0] : (lang === 'am' ? 'እንግዳ' : 'there')

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        if (isOpen) {
            scrollToBottom()
        }
    }, [messages, isOpen])

    // Load initial greeting on first open or language switch
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            initWelcomeMessage(lang)
        }
    }, [isOpen])

    const initWelcomeMessage = (selectedLang) => {
        const textDict = UI_TEXT[selectedLang] || UI_TEXT.en
        const welcome = {
            id: 'welcome_' + Date.now(),
            sender: 'hotel_ai',
            text: textDict.welcome(userName),
            suggested_questions: textDict.defaultSuggestions
        }
        setMessages([welcome])
    }

    const toggleLanguage = (newLang) => {
        setLang(newLang)
        setContext(prev => ({ ...prev, lang: newLang }))
        toast.success(newLang === 'am' ? 'ቋንቋ ወደ አማርኛ ተቀይሯል' : 'Language switched to English', { icon: '🌐' })
        if (messages.length <= 1) {
            initWelcomeMessage(newLang)
        }
    }

    // Listen for custom trigger events from other components
    useEffect(() => {
        const handleOpenAI = (e) => {
            setOpenState(true)
            if (e.detail?.query) {
                if (/[\u1200-\u137F]/.test(e.detail.query)) {
                    setLang('am')
                }
                handleSend(e.detail.query, { ...context, ...e.detail.context, lang: /[\u1200-\u137F]/.test(e.detail.query) ? 'am' : lang })
            }
        }
        window.addEventListener('open-hotel-ai', handleOpenAI)
        return () => window.removeEventListener('open-hotel-ai', handleOpenAI)
    }, [lang, context])

    const handleSend = async (messageText = null, customContext = null) => {
        const query = (messageText !== null ? messageText : input).trim()
        if (!query || loading) return

        // Auto-detect language from user input
        const detectedAmharic = /[\u1200-\u137F]/.test(query)
        const activeLang = detectedAmharic ? 'am' : (customContext?.lang || lang)
        if (detectedAmharic && lang !== 'am') {
            setLang('am')
        }

        const activeContext = {
            ...(customContext || context),
            lang: activeLang
        }

        const userMsg = {
            id: 'u_' + Date.now(),
            sender: 'customer',
            text: query,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }

        setMessages(prev => [...prev, userMsg])
        if (messageText === null) {
            setInput('')
        }
        setLoading(true)

        try {
            const res = await chatHotelAI({
                message: query,
                context: activeContext,
                session_id: sessionId
            })

            const aiData = res.data
            const aiMsg = {
                id: 'ai_' + Date.now(),
                sender: 'hotel_ai',
                text: aiData.reply,
                predicted_rooms: aiData.predicted_rooms || [],
                available_dining: aiData.available_dining || [],
                suggested_questions: aiData.suggested_questions || [],
                action: aiData.action,
                reservation_params: aiData.reservation_params,
                language: aiData.language,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }

            // Update context if dates were detected
            if (aiData.reservation_params) {
                setContext(prev => ({
                    ...prev,
                    check_in: aiData.reservation_params.check_in || prev.check_in,
                    check_out: aiData.reservation_params.check_out || prev.check_out,
                    guests: aiData.reservation_params.guests || prev.guests,
                    lang: activeLang
                }))
            }

            setMessages(prev => [...prev, aiMsg])
        } catch (err) {
            console.error('Hotel AI error:', err)
            setMessages(prev => [
                ...prev,
                {
                    id: 'err_' + Date.now(),
                    sender: 'hotel_ai',
                    text: t.error,
                    suggested_questions: t.defaultSuggestions.slice(0, 2)
                }
            ])
        } finally {
            setLoading(false)
        }
    }

    const handleClearChat = async () => {
        if (!confirm(t.resetConfirm)) return
        try {
            await clearHotelAIHistory(sessionId)
        } catch (e) {
            // ignore
        }
        initWelcomeMessage(lang)
    }

    const handleRoomSelect = (room) => {
        const msg = lang === 'am' ? `ክፍል #${room.room_number} ተመርጧል!` : `Selected Room #${room.room_number} (${room.type})!`
        toast.success(msg)
        if (onSelectRoom) {
            onSelectRoom(room, context)
        } else {
            window.dispatchEvent(new CustomEvent('hotel-ai-book-room', { 
                detail: { room, context } 
            }))
        }
        setOpenState(false)
    }

    const handleDiningSelect = (item) => {
        const msg = lang === 'am' ? `${item.name} ወደ ትዕዛዝ ተጨምሯል!` : `Added ${item.name} ($${item.price}) to reservation!`
        toast.success(msg)
        if (onSelectDining) {
            onSelectDining(item)
        } else {
            window.dispatchEvent(new CustomEvent('hotel-ai-add-dining', { 
                detail: { item } 
            }))
        }
    }

    const renderFormattedText = (text) => {
        if (!text) return null
        return text.split('\n').map((line, idx) => {
            let processed = line
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')

            return (
                <p 
                    key={idx} 
                    className="mb-1 last:mb-0 text-[11px] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: processed }}
                />
            )
        })
    }

    return (
        <div className="fixed bottom-4 right-4 z-40 pointer-events-auto">
            {/* 1. SMALL COMPACT MINIMIZED BUTTON ON THE RIGHT SIDE (DOES NOT COVER THE DASHBOARD) */}
            {!isOpen && (
                <button
                    id="hotel-ai-minimized-btn"
                    type="button"
                    onClick={() => setOpenState(true)}
                    className="group flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                    style={{
                        background: 'linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%)',
                        borderColor: 'rgba(56, 189, 248, 0.4)',
                        boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)'
                    }}
                    title="Open Hotel AI (EN / አማርኛ)"
                >
                    <div className="relative">
                        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-left leading-none">
                        <span className="text-xs font-bold text-white tracking-wide">Hotel AI</span>
                        <span className="text-[9px] uppercase font-semibold bg-white/20 text-sky-100 px-1 py-0.5 rounded">
                            EN | አማ
                        </span>
                    </div>
                </button>
            )}

            {/* 2. SMALL COMPACT AI CHAT WINDOW (COMPACT SIZE, NEVER COVERS FULL DASHBOARD) */}
            {isOpen && (
                <div 
                    className="flex flex-col w-[310px] sm:w-[330px] h-[440px] max-h-[62vh] rounded-xl shadow-2xl border overflow-hidden"
                    style={{
                        background: 'linear-gradient(180deg, #091222 0%, #060b14 100%)',
                        borderColor: 'rgba(56, 189, 248, 0.3)',
                        boxShadow: '0 15px 40px -10px rgba(0, 0, 0, 0.75), 0 0 15px rgba(14, 165, 233, 0.2)'
                    }}
                >
                    {/* COMPACT HEADER */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-sky-950/80 bg-slate-900/90 backdrop-blur-md flex-shrink-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                    <h3 className="text-xs font-bold text-white tracking-wide truncate">{t.title}</h3>
                                    <span className="text-[8px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-1 py-0.2 rounded">
                                        {t.status}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-1 text-slate-400 flex-shrink-0">
                            {/* LANGUAGE SWITCHER */}
                            <div className="flex items-center bg-slate-800/90 p-0.5 rounded border border-slate-700/60">
                                <button
                                    type="button"
                                    onClick={() => toggleLanguage('en')}
                                    className={`px-1 py-0.2 text-[9px] font-bold rounded transition-colors ${
                                        lang === 'en' ? 'bg-sky-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    EN
                                </button>
                                <button
                                    type="button"
                                    onClick={() => toggleLanguage('am')}
                                    className={`px-1 py-0.2 text-[9px] font-bold rounded transition-colors ${
                                        lang === 'am' ? 'bg-sky-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    አማ
                                </button>
                            </div>

                            <button 
                                onClick={handleClearChat}
                                title={t.resetConfirm}
                                className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors"
                            >
                                <RotateCcw className="w-3 h-3" />
                            </button>
                            
                            {/* MINIMIZE TO SMALL SIZE */}
                            <button 
                                onClick={() => setOpenState(false)}
                                title="Minimize"
                                className="p-1 hover:text-sky-300 hover:bg-slate-800 rounded transition-colors"
                            >
                                <Minus className="w-3.5 h-3.5" />
                            </button>

                            <button 
                                onClick={() => setOpenState(false)}
                                title="Close"
                                className="p-1 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* COMPACT MESSAGES SCROLL CONTAINER */}
                    <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 text-slate-200 scrollbar-thin scrollbar-thumb-slate-700">
                        {messages.map((msg) => (
                            <div 
                                key={msg.id} 
                                className={`flex flex-col ${msg.sender === 'customer' ? 'items-end' : 'items-start'}`}
                            >
                                <div className="flex items-center gap-1 mb-0.5 px-1">
                                    {msg.sender === 'hotel_ai' ? (
                                        <span className="text-[9px] font-bold text-sky-400 tracking-wider uppercase flex items-center gap-0.5">
                                            <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                                            {lang === 'am' ? 'ሆቴል አይ' : 'Hotel AI'}
                                        </span>
                                    ) : (
                                        <span className="text-[9px] font-semibold text-slate-400">
                                            {lang === 'am' ? 'እርስዎ' : 'You'}
                                        </span>
                                    )}
                                    {msg.time && (
                                        <span className="text-[8px] text-slate-500">{msg.time}</span>
                                    )}
                                </div>

                                {/* MESSAGE BUBBLE (COMPACT) */}
                                <div 
                                    className={`max-w-[94%] rounded-xl px-2.5 py-1.5 text-[11px] shadow-sm ${
                                        msg.sender === 'customer'
                                            ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white rounded-br-none'
                                            : 'bg-slate-900 border border-slate-800/90 text-slate-200 rounded-bl-none'
                                    }`}
                                >
                                    {renderFormattedText(msg.text)}
                                </div>

                                {/* PREDICTED ROOMS (COMPACT) */}
                                {msg.predicted_rooms && msg.predicted_rooms.length > 0 && (
                                    <div className="w-full mt-2 space-y-1.5">
                                        <div className="flex items-center justify-between text-[10px] font-semibold text-sky-400 px-1">
                                            <span className="flex items-center gap-1">
                                                <BedDouble className="w-3 h-3" />
                                                {t.predictedRoomsLabel} ({msg.predicted_rooms.length})
                                            </span>
                                            <span className="text-emerald-400 text-[9px]">
                                                ✓ {t.guaranteed}
                                            </span>
                                        </div>

                                        <div className="space-y-1.5">
                                            {msg.predicted_rooms.map((room) => (
                                                <div 
                                                    key={room.id}
                                                    className="p-2 rounded-lg border border-sky-900/40 bg-slate-900/70 flex items-center justify-between gap-1.5 hover:border-sky-500/50 transition-all"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-bold text-white text-xs">
                                                                #{room.room_number}
                                                            </span>
                                                            <span className="text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800">
                                                                {lang === 'am' ? (room.type_label_am || room.type) : (room.type_label_en || room.type)}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">
                                                            ${room.price_per_night} {lang === 'am' ? '/ሌሊት' : '/night'}
                                                        </span>
                                                    </div>

                                                    <button
                                                        onClick={() => handleRoomSelect(room)}
                                                        className="py-1 px-2 rounded bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 text-[10px] font-bold transition-all flex items-center gap-0.5 border border-sky-500/40 flex-shrink-0"
                                                    >
                                                        {t.reserveRoom(room.room_number)}
                                                        <ArrowRight className="w-2.5 h-2.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* AVAILABLE DINING (COMPACT) */}
                                {msg.available_dining && msg.available_dining.length > 0 && (
                                    <div className="w-full mt-2 space-y-1.5">
                                        <div className="flex items-center justify-between text-[10px] font-semibold text-amber-400 px-1">
                                            <span className="flex items-center gap-1">
                                                <Utensils className="w-3 h-3" />
                                                {t.availableDiningLabel} ({msg.available_dining.length})
                                            </span>
                                            <span className="text-emerald-400 text-[9px]">
                                                {t.kitchenActive}
                                            </span>
                                        </div>

                                        <div className="space-y-1">
                                            {msg.available_dining.map((item) => (
                                                <div 
                                                    key={item.id}
                                                    className="p-1.5 rounded-lg border border-amber-900/30 bg-slate-900/70 flex items-center justify-between gap-1.5"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="text-[11px] font-bold text-white truncate">
                                                            {item.name}
                                                        </div>
                                                        <span className="text-[10px] text-amber-400 font-semibold">
                                                            ${item.price}
                                                        </span>
                                                    </div>

                                                    <button
                                                        onClick={() => handleDiningSelect(item)}
                                                        className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 text-[9px] font-bold border border-amber-500/40 transition-colors flex-shrink-0"
                                                    >
                                                        {t.addToOrder}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* SHORT SUGGESTIONS CHIPS */}
                                {msg.suggested_questions && msg.suggested_questions.length > 0 && (
                                    <div className="w-full mt-1.5 flex flex-wrap gap-1">
                                        {msg.suggested_questions.map((q, i) => (
                                            <button
                                                key={i}
                                                onClick={() => handleSend(q)}
                                                className="text-[9px] bg-sky-950/80 hover:bg-sky-900 text-sky-200 border border-sky-800/60 px-2 py-0.5 rounded-full transition-all text-left"
                                            >
                                                💬 {q}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {loading && (
                            <div className="flex items-center gap-1.5 text-sky-400 text-[10px] py-1 px-1">
                                <div className="w-3.5 h-3.5 rounded-full bg-sky-900 flex items-center justify-center animate-spin">
                                    <Sparkles className="w-2 h-2 text-sky-300" />
                                </div>
                                <span>{t.loading}</span>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* COMPACT INPUT FORM */}
                    <form 
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="p-2 border-t border-slate-800 bg-slate-900/95 flex items-center gap-1.5 flex-shrink-0"
                    >
                        <input 
                            id="hotel-ai-input"
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t.placeholder}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                        />
                        <button
                            id="hotel-ai-submit"
                            type="submit"
                            disabled={!input.trim() || loading}
                            className="p-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed font-bold transition-all shadow-sm"
                        >
                            <Send className="w-3 h-3" />
                        </button>
                    </form>
                </div>
            )}
        </div>
    )
}
