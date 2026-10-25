import React, { useState, useEffect, useRef } from 'react'
import { 
    Sparkles, Send, X, BedDouble, Utensils, 
    Calendar, Users, RotateCcw, 
    Minus, ArrowRight, ChevronUp, ChevronDown
} from 'lucide-react'
import toast from 'react-hot-toast'
import { chatHotelAI, getHotelAIHistory, clearHotelAIHistory } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

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
    const { currentTheme } = useTheme()
    const isLight = currentTheme?.colorScheme === 'light'
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
                    style={{
                        margin: '0 0 4px',
                        fontSize: 11.5,
                        lineHeight: 1.55,
                        color: 'inherit'
                    }}
                    dangerouslySetInnerHTML={{ __html: processed }}
                />
            )
        })
    }

    // Dynamic theme palette for the AI widget
    const th = isLight ? {
        windowBg: '#ffffff',
        windowBorder: '#cbd5e1',
        windowShadow: '0 16px 40px rgba(0, 0, 0, 0.15)',
        headerBg: '#f8fafc',
        headerBorder: '#e2e8f0',
        titleColor: '#0f172a',
        statusBg: '#dcfce7',
        statusText: '#15803d',
        statusBorder: '#86efac',
        langInactiveText: '#64748b',
        langActiveBg: 'var(--tp-acc, #059669)',
        langActiveText: '#ffffff',
        headerBtnColor: '#64748b',
        bodyBg: '#ffffff',
        aiBubbleBg: '#f1f5f9',
        aiBubbleBorder: '#e2e8f0',
        aiBubbleText: '#0f172a',
        userBubbleBg: 'linear-gradient(135deg, var(--tp-acc, #059669) 0%, #047857 100%)',
        userBubbleText: '#ffffff',
        cardBg: '#ffffff',
        cardBorder: '#cbd5e1',
        cardText: '#0f172a',
        cardSub: '#64748b',
        chipBg: '#f1f5f9',
        chipBorder: '#cbd5e1',
        chipText: '#0f172a',
        inputBg: '#ffffff',
        inputBorder: '#cbd5e1',
        inputText: '#0f172a',
        inputPlaceholder: '#94a3b8',
        inputFormBg: '#f8fafc',
        inputFormBorder: '#e2e8f0'
    } : {
        windowBg: 'linear-gradient(180deg, #091222 0%, #060b14 100%)',
        windowBorder: 'rgba(56, 189, 248, 0.3)',
        windowShadow: '0 15px 40px -10px rgba(0, 0, 0, 0.75), 0 0 15px rgba(14, 165, 233, 0.2)',
        headerBg: '#0f172a',
        headerBorder: '#1e293b',
        titleColor: '#ffffff',
        statusBg: '#052e16',
        statusText: '#4ade80',
        statusBorder: 'rgba(22, 101, 52, 0.6)',
        langInactiveText: '#94a3b8',
        langActiveBg: '#0284c7',
        langActiveText: '#ffffff',
        headerBtnColor: '#94a3b8',
        bodyBg: '#060b14',
        aiBubbleBg: '#0f172a',
        aiBubbleBorder: '#1e293b',
        aiBubbleText: '#e2e8f0',
        userBubbleBg: 'linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%)',
        userBubbleText: '#ffffff',
        cardBg: '#0f172a',
        cardBorder: 'rgba(56, 189, 248, 0.25)',
        cardText: '#ffffff',
        cardSub: '#94a3b8',
        chipBg: 'rgba(12, 26, 48, 0.8)',
        chipBorder: 'rgba(56, 189, 248, 0.3)',
        chipText: '#bae6fd',
        inputBg: '#020617',
        inputBorder: '#1e293b',
        inputText: '#ffffff',
        inputPlaceholder: '#64748b',
        inputFormBg: '#0f172a',
        inputFormBorder: '#1e293b'
    }

    return (
        <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1100, pointerEvents: 'auto' }}>
            {/* 1. SMALL COMPACT MINIMIZED BUTTON ON THE RIGHT SIDE */}
            {!isOpen && (
                <button
                    id="hotel-ai-minimized-btn"
                    type="button"
                    onClick={() => setOpenState(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 14px',
                        borderRadius: 30,
                        background: isLight 
                            ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' 
                            : 'linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%)',
                        border: isLight ? '1.5px solid #059669' : '1.5px solid rgba(56, 189, 248, 0.4)',
                        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                        cursor: 'pointer',
                        color: '#ffffff'
                    }}
                    title="Open Hotel AI (EN / አማርኛ)"
                >
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Sparkles size={16} color="#fde047" />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em' }}>
                            Hotel AI
                        </span>
                        <span style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 700, background: 'rgba(255,255,255,0.22)', color: '#ffffff', padding: '2px 5px', borderRadius: 4 }}>
                            EN | አማ
                        </span>
                    </div>
                </button>
            )}

            {/* 2. SMALL COMPACT AI CHAT WINDOW (THEME-ADAPTIVE & READABLE) */}
            {isOpen && (
                <div 
                    id="hotel-ai-chat-window"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        width: 330,
                        maxWidth: 'calc(100vw - 24px)',
                        height: 450,
                        maxHeight: '65vh',
                        borderRadius: 14,
                        background: th.windowBg,
                        border: `1.5px solid ${th.windowBorder}`,
                        boxShadow: th.windowShadow,
                        overflow: 'hidden',
                        color: th.titleColor
                    }}
                >
                    {/* COMPACT HEADER */}
                    <div 
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderBottom: `1px solid ${th.headerBorder}`,
                            background: th.headerBg,
                            flexShrink: 0
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                            <div 
                                style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 6,
                                    background: isLight 
                                        ? 'linear-gradient(135deg, #059669, #10b981)' 
                                        : 'linear-gradient(135deg, #0284c7, #4f46e5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}
                            >
                                <Sparkles size={13} color="#fde047" />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <h3 style={{ fontSize: 12.5, fontWeight: 800, color: th.titleColor, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {t.title}
                                    </h3>
                                    <span 
                                        style={{
                                            fontSize: 8.5,
                                            fontWeight: 700,
                                            background: th.statusBg,
                                            color: th.statusText,
                                            border: `1px solid ${th.statusBorder}`,
                                            padding: '1px 5px',
                                            borderRadius: 4
                                        }}
                                    >
                                        {t.status}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {/* LANGUAGE SWITCHER */}
                            <div style={{ display: 'flex', alignItems: 'center', background: isLight ? '#f1f5f9' : '#1e293b', padding: 2, borderRadius: 6, border: `1px solid ${th.headerBorder}` }}>
                                <button
                                    type="button"
                                    onClick={() => toggleLanguage('en')}
                                    style={{
                                        padding: '1px 6px',
                                        fontSize: 9,
                                        fontWeight: 800,
                                        borderRadius: 4,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: lang === 'en' ? th.langActiveBg : 'transparent',
                                        color: lang === 'en' ? th.langActiveText : th.langInactiveText
                                    }}
                                >
                                    EN
                                </button>
                                <button
                                    type="button"
                                    onClick={() => toggleLanguage('am')}
                                    style={{
                                        padding: '1px 6px',
                                        fontSize: 9,
                                        fontWeight: 800,
                                        borderRadius: 4,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: lang === 'am' ? th.langActiveBg : 'transparent',
                                        color: lang === 'am' ? th.langActiveText : th.langInactiveText
                                    }}
                                >
                                    አማ
                                </button>
                            </div>

                            <button 
                                type="button"
                                onClick={handleClearChat}
                                title={t.resetConfirm}
                                style={{ padding: 4, background: 'none', border: 'none', color: th.headerBtnColor, cursor: 'pointer', display: 'flex' }}
                            >
                                <RotateCcw size={13} />
                            </button>
                            
                            <button 
                                type="button"
                                onClick={() => setOpenState(false)}
                                title="Minimize"
                                style={{ padding: 4, background: 'none', border: 'none', color: th.headerBtnColor, cursor: 'pointer', display: 'flex' }}
                            >
                                <Minus size={14} />
                            </button>

                            <button 
                                type="button"
                                onClick={() => setOpenState(false)}
                                title="Close"
                                style={{ padding: 4, background: 'none', border: 'none', color: isLight ? '#dc2626' : '#f87171', cursor: 'pointer', display: 'flex' }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    {/* COMPACT MESSAGES SCROLL CONTAINER */}
                    <div 
                        style={{
                            flex: 1,
                            padding: 10,
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                            background: th.bodyBg
                        }}
                    >
                        {messages.map((msg) => (
                            <div 
                                key={msg.id} 
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: msg.sender === 'customer' ? 'flex-end' : 'flex-start'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, padding: '0 4px' }}>
                                    {msg.sender === 'hotel_ai' ? (
                                        <span style={{ fontSize: 9.5, fontWeight: 800, color: isLight ? '#0284c7' : '#38bdf8', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Sparkles size={10} color="#eab308" />
                                            {lang === 'am' ? 'ሆቴል አይ' : 'Hotel AI'}
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: 9.5, fontWeight: 700, color: th.cardSub }}>
                                            {lang === 'am' ? 'እርስዎ' : 'You'}
                                        </span>
                                    )}
                                    {msg.time && (
                                        <span style={{ fontSize: 8.5, color: th.cardSub }}>{msg.time}</span>
                                    )}
                                </div>

                                {/* MESSAGE BUBBLE WITH GUARANTEED HIGH-CONTRAST READABLE WORDS */}
                                <div 
                                    style={{
                                        maxWidth: '92%',
                                        borderRadius: 12,
                                        borderBottomRightRadius: msg.sender === 'customer' ? 2 : 12,
                                        borderBottomLeftRadius: msg.sender === 'hotel_ai' ? 2 : 12,
                                        padding: '7px 11px',
                                        fontSize: 11.5,
                                        lineHeight: 1.5,
                                        background: msg.sender === 'customer' ? th.userBubbleBg : th.aiBubbleBg,
                                        border: msg.sender === 'customer' ? 'none' : `1px solid ${th.aiBubbleBorder}`,
                                        color: msg.sender === 'customer' ? th.userBubbleText : th.aiBubbleText,
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
                                    }}
                                >
                                    {renderFormattedText(msg.text)}
                                </div>

                                {/* PREDICTED ROOMS */}
                                {msg.predicted_rooms && msg.predicted_rooms.length > 0 && (
                                    <div style={{ width: '100%', marginTop: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 700, color: isLight ? '#0284c7' : '#38bdf8', padding: '0 4px', marginBottom: 6 }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <BedDouble size={12} />
                                                {t.predictedRoomsLabel} ({msg.predicted_rooms.length})
                                            </span>
                                            <span style={{ color: '#16a34a', fontSize: 9.5, fontWeight: 700 }}>
                                                ✓ {t.guaranteed}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {msg.predicted_rooms.map((room) => (
                                                <div 
                                                    key={room.id}
                                                    style={{
                                                        padding: 8,
                                                        borderRadius: 8,
                                                        border: `1px solid ${th.cardBorder}`,
                                                        background: th.cardBg,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: 6
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                            <span style={{ fontWeight: 800, color: th.cardText, fontSize: 12 }}>
                                                                #{room.room_number}
                                                            </span>
                                                            <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', padding: '1px 5px', borderRadius: 4, background: isLight ? '#e0f2fe' : '#082f49', color: isLight ? '#0369a1' : '#7dd3fc', border: isLight ? '1px solid #bae6fd' : '1px solid #0369a1' }}>
                                                                {lang === 'am' ? (room.type_label_am || room.type) : (room.type_label_en || room.type)}
                                                            </span>
                                                        </div>
                                                        <span style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 800, display: 'block', marginTop: 2 }}>
                                                            ${room.price_per_night} {lang === 'am' ? '/ሌሊት' : '/night'}
                                                        </span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleRoomSelect(room)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            borderRadius: 6,
                                                            background: isLight ? '#0284c7' : 'rgba(56,189,248,0.2)',
                                                            color: isLight ? '#ffffff' : '#38bdf8',
                                                            border: isLight ? 'none' : '1px solid rgba(56,189,248,0.4)',
                                                            fontSize: 10,
                                                            fontWeight: 800,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 3,
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        <span>{t.reserveRoom(room.room_number)}</span>
                                                        <ArrowRight size={11} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* AVAILABLE DINING */}
                                {msg.available_dining && msg.available_dining.length > 0 && (
                                    <div style={{ width: '100%', marginTop: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 700, color: '#d97706', padding: '0 4px', marginBottom: 6 }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Utensils size={12} />
                                                {t.availableDiningLabel} ({msg.available_dining.length})
                                            </span>
                                            <span style={{ color: '#16a34a', fontSize: 9.5 }}>
                                                {t.kitchenActive}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            {msg.available_dining.map((item) => (
                                                <div 
                                                    key={item.id}
                                                    style={{
                                                        padding: '6px 8px',
                                                        borderRadius: 8,
                                                        border: `1px solid ${th.cardBorder}`,
                                                        background: th.cardBg,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: 6
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: 11, fontWeight: 700, color: th.cardText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.name}
                                                        </div>
                                                        <span style={{ fontSize: 10, color: '#d97706', fontWeight: 800 }}>
                                                            ${item.price}
                                                        </span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleDiningSelect(item)}
                                                        style={{
                                                            padding: '3px 8px',
                                                            borderRadius: 6,
                                                            background: isLight ? '#fef3c7' : 'rgba(245,158,11,0.2)',
                                                            color: isLight ? '#b45309' : '#fcd34d',
                                                            border: isLight ? '1px solid #fde68a' : '1px solid rgba(245,158,11,0.4)',
                                                            fontSize: 9.5,
                                                            fontWeight: 800,
                                                            cursor: 'pointer',
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        {t.addToOrder}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* SUGGESTED QUESTIONS CHIPS */}
                                {msg.suggested_questions && msg.suggested_questions.length > 0 && (
                                    <div style={{ width: '100%', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {msg.suggested_questions.map((q, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => handleSend(q)}
                                                style={{
                                                    fontSize: 9.5,
                                                    fontWeight: 600,
                                                    background: th.chipBg,
                                                    color: th.chipText,
                                                    border: `1px solid ${th.chipBorder}`,
                                                    padding: '3px 8px',
                                                    borderRadius: 20,
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                💬 {q}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {loading && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: isLight ? '#0284c7' : '#38bdf8', fontSize: 10.5, padding: '4px 6px' }}>
                                <div style={{ width: 14, height: 14, borderRadius: '50%', background: isLight ? '#e0f2fe' : '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Sparkles size={9} color={isLight ? '#0284c7' : '#38bdf8'} />
                                </div>
                                <span>{t.loading}</span>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* COMPACT INPUT FORM */}
                    <form 
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        style={{
                            padding: '6px 8px',
                            borderTop: `1px solid ${th.inputFormBorder}`,
                            background: th.inputFormBg,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexShrink: 0
                        }}
                    >
                        <input 
                            id="hotel-ai-input"
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t.placeholder}
                            style={{
                                flex: 1,
                                background: th.inputBg,
                                border: `1px solid ${th.inputBorder}`,
                                borderRadius: 8,
                                padding: '6px 9px',
                                fontSize: 11,
                                color: th.inputText,
                                outline: 'none'
                            }}
                        />
                        <button
                            id="hotel-ai-submit"
                            type="submit"
                            disabled={!input.trim() || loading}
                            style={{
                                padding: '6px 10px',
                                borderRadius: 8,
                                background: isLight ? '#059669' : '#0284c7',
                                color: '#ffffff',
                                border: 'none',
                                cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
                                opacity: (!input.trim() || loading) ? 0.45 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <Send size={13} />
                        </button>
                    </form>
                </div>
            )}
        </div>
    )
}
