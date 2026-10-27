import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Hotel, BedDouble, Calendar, Users, Sparkles, Utensils,
  GlassWater, ShieldCheck, CreditCard, ArrowRight, CheckCircle2,
  Phone, Mail, MapPin, Clock, Award, Star, Compass, BookOpen,
  Coffee, Wifi, Car, Waves, HeartHandshake, ChevronRight, X
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getRooms, createBooking, PAYMENT_METHODS } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import ThemeSelector from '../components/ThemeSelector'
import HotelBuildingParkShowcase from '../components/HotelBuildingParkShowcase'
import HotelAIWidget from '../components/HotelAIWidget'

// High-res luxury hotel assets
import hotelBuildingImg from '../assets/hotel_building_park.jpg'
import diningImg from '../assets/guests_dining_feeding.jpg'
import drinksImg from '../assets/guests_refreshment_drinking.jpg'

const HEADING_WORDS = ['Welcome', 'to', 'Your', 'Grand', 'Escape', 'Hotel', 'in', 'Ethiopia']

export default function Landing() {
  const { user } = useAuth()
  const { currentTheme } = useTheme()
  const navigate = useNavigate()

  const [rooms, setRooms] = useState([])
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [bookingModal, setBookingModal] = useState(false)
  const [submittingBooking, setSubmittingBooking] = useState(false)
  const [headingAnimDone, setHeadingAnimDone] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setHeadingAnimDone(true)
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  // Quick search bar state
  const [searchCheckIn, setSearchCheckIn] = useState('')
  const [searchCheckOut, setSearchCheckOut] = useState('')
  const [searchGuests, setSearchGuests] = useState('1')
  const [searchType, setSearchType] = useState('all')

  // Booking Form State
  const [form, setForm] = useState({
    room_id: '',
    check_in: '',
    check_out: '',
    adults: 1,
    children: 0,
    special_requests: '',
    name: user?.name || '',
    phone: user?.phone || '',
    reason_for_stay: 'Tourism / Leisure',
    id_proof: 'National ID',
    id_number: '',
    payment_method: 'telebirr',
    payment_amount: '',
    transaction_id: ''
  })

  useEffect(() => {
    getRooms()
      .then(res => {
        setRooms(Array.isArray(res.data) ? res.data : [])
      })
      .catch(err => {
        console.error('Failed to load rooms for landing:', err)
      })
      .finally(() => setLoadingRooms(false))
  }, [])

  useEffect(() => {
    const handleAiBookRoom = (e) => {
      if (e.detail?.room) {
        handleOpenBooking(e.detail.room)
      }
    }
    window.addEventListener('hotel-ai-book-room', handleAiBookRoom)
    return () => window.removeEventListener('hotel-ai-book-room', handleAiBookRoom)
  }, [rooms])

  const handleOpenBooking = (room = null) => {
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

    const targetRoom = room || rooms[0]
    setSelectedRoom(targetRoom)
    setForm(prev => ({
      ...prev,
      room_id: targetRoom?.id || '',
      check_in: searchCheckIn || today,
      check_out: searchCheckOut || tomorrow,
      adults: Number(searchGuests) || 1,
      payment_amount: targetRoom?.price_per_night || '',
      name: user?.name || prev.name,
      phone: user?.phone || prev.phone
    }))
    setBookingModal(true)
  }

  const handleBookingSubmit = async (e) => {
    e.preventDefault()
    if (!form.room_id) return toast.error('Please select a room')
    if (!form.check_in || !form.check_out) return toast.error('Please choose check-in and check-out dates')
    if (new Date(form.check_out) <= new Date(form.check_in)) {
      return toast.error('Check-out date must be after check-in date')
    }
    if (!form.name.trim()) return toast.error('Guest name is required')

    const targetRoom = selectedRoom || rooms.find(item => String(item.id) === String(form.room_id))
    const totalGuests = (Number(form.adults) || 1) + (Number(form.children) || 0)
    const roomMaxCapacity = Number(targetRoom?.max_guests || 2)

    if (targetRoom && totalGuests > roomMaxCapacity) {
      return toast.error(`Room #${targetRoom.room_number} cannot be booked: ${totalGuests} guests exceeds the room's maximum capacity of ${roomMaxCapacity} guests.`)
    }

    if (!user) {
      toast.info('Comfortable with our hotel? Please register or sign in to your guest account to confirm your reservation.')
      navigate('/register')
      return
    }

    setSubmittingBooking(true)
    try {
      await createBooking(form)
      toast.success('🎉 Booking confirmed successfully! Welcome to Grand Hotel!')
      setBookingModal(false)
      // If customer is logged in, offer to take them to My Bookings
      if (user?.role === 'customer') {
        setTimeout(() => navigate('/my-bookings'), 1200)
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to complete reservation')
    } finally {
      setSubmittingBooking(false)
    }
  }

  const filteredRooms = rooms.filter(r => {
    if (searchType !== 'all' && r.type !== searchType) return false
    return true
  })

  return (
    <div className="landing-container" style={{ minHeight: '100vh', background: 'var(--tp-canvas, #050805)', color: 'var(--tp-ink, #e7ffe4)' }}>

      {/* ── TOP HERO HEADER & BANNER ────────────────────────────────────────── */}
      <header
        className="landing-header"
        style={{
          position: 'relative',
          minHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundImage: `linear-gradient(180deg, rgba(5,8,5,0.7) 0%, rgba(5,8,5,0.92) 80%, var(--tp-canvas, #050805) 100%), url(${hotelBuildingImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderBottom: '1px solid var(--tp-line, rgba(255,255,255,0.12))',
          padding: '24px 28px 48px'
        }}
      >
        {/* Top Navbar Row */}
        <div className="landing-top-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, zIndex: 10 }}>
          <div className="landing-brand" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--tp-acc, #22c55e), var(--tp-line, #16a34a))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                flexShrink: 0
              }}
            >
              <Hotel size={24} color="#050805" />
            </div>
            <div>
              <div className="landing-brand-title" style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>
                Grand Hotel & Luxury Suites
              </div>
              <div className="landing-brand-sub" style={{ fontSize: 11, color: 'var(--tp-mute, #86a882)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
                Resort Park & International Hospitality
              </div>
            </div>
          </div>

          <div className="landing-actions" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <ThemeSelector variant="dropdown" align="right" />

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '5px 12px',
                    borderRadius: 20,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid var(--tp-line, rgba(255,255,255,0.2))',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--tp-ink, #fff)'
                  }}
                >
                  👋 {user.name} ({user.role})
                </span>
                {user.role === 'customer' ? (
                  <Link
                    to="/my-bookings"
                    className="btn btn-sm btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                  >
                    <BookOpen size={15} />
                    My Bookings
                  </Link>
                ) : (
                  <Link
                    to="/dashboard"
                    className="btn btn-sm btn-outline"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                  >
                    Operations Dashboard
                  </Link>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Link to="/login" className="btn btn-sm btn-outline" style={{ fontWeight: 600 }}>
                  Sign In
                </Link>
                <Link to="/register" className="btn btn-sm btn-primary" style={{ fontWeight: 700 }}>
                  Register Customer
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Hero Headline and CTA */}
        <div className="landing-hero" style={{ maxWidth: 900, margin: '60px auto 30px', textAlign: 'center', zIndex: 10 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 16px',
              borderRadius: 30,
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
              border: '1px solid var(--tp-line, rgba(255,255,255,0.2))',
              marginBottom: 18,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--tp-acc, #22c55e)'
            }}
          >
            <Star size={14} fill="currentColor" />
            <span>5-Star World-Class Resort & Luxury Hospitality</span>
            <Sparkles size={14} />
          </div>

          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 54px)',
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              marginBottom: 18,
              color: '#ffffff',
              textShadow: '0 4px 20px rgba(0,0,0,0.6)'
            }}
          >
            {HEADING_WORDS.map((word, idx) => (
              <span
                key={idx}
                className={headingAnimDone ? 'hero-anim-word-done' : 'hero-anim-word'}
                style={{
                  marginRight: '0.28em',
                  animationDelay: headingAnimDone ? undefined : `${idx * 0.15}s`
                }}
                onAnimationEnd={idx === HEADING_WORDS.length - 1 ? () => setHeadingAnimDone(true) : undefined}
              >
                {word}
              </span>
            ))}
          </h1>

          <p
            style={{
              fontSize: 'clamp(14px, 2vw, 17px)',
              lineHeight: 1.6,
              color: '#cbd5e1',
              maxWidth: 720,
              margin: '0 auto 28px',
              textShadow: '0 2px 10px rgba(0,0,0,0.8)'
            }}
          >
            Immerse yourself in panoramic suites, scenic botanical gardens, Michelin-inspired Ethiopian and continental dining, and our 24/7 Bilingual AI Concierge.
          </p>

          {/* Quick Action Buttons */}
          <div className="landing-hero-cta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleOpenBooking()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '13px 26px',
                borderRadius: 30,
                background: 'linear-gradient(135deg, var(--tp-acc, #22c55e), var(--tp-acc-2, #38bdf8))',
                color: '#050805',
                fontSize: 15,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              <BedDouble size={18} />
              <span>Reserve a Luxury Room</span>
              <ArrowRight size={17} />
            </button>

            <a
              href="#building-park-section"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '13px 22px',
                borderRadius: 30,
                background: 'rgba(34,197,94,0.18)',
                backdropFilter: 'blur(8px)',
                color: '#86efac',
                fontSize: 14,
                fontWeight: 700,
                border: '1px solid rgba(34,197,94,0.4)',
                textDecoration: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Compass size={17} />
              <span>Explore 6 Floors & Park</span>
            </a>

            {!user && (
              <Link
                to="/register"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '13px 22px',
                  borderRadius: 30,
                  background: 'rgba(255,255,255,0.12)',
                  backdropFilter: 'blur(8px)',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 700,
                  border: '1px solid rgba(255,255,255,0.3)',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <Users size={17} />
                <span>Register Customer</span>
              </Link>
            )}

            <Link
              to="/dining"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '13px 22px',
                borderRadius: 30,
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(8px)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 700,
                border: '1px solid rgba(255,255,255,0.25)',
                textDecoration: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Utensils size={17} />
              <span>Dining & Bar Menu</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-hotel-ai', { detail: { query: 'Hello! What rooms are available today?' } }))
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '13px 22px',
                borderRadius: 30,
                background: 'rgba(2,132,199,0.25)',
                backdropFilter: 'blur(8px)',
                color: '#38bdf8',
                fontSize: 14,
                fontWeight: 700,
                border: '1px solid rgba(56,189,248,0.4)',
                cursor: 'pointer'
              }}
            >
              <Sparkles size={17} />
              <span>Ask Hotel AI Concierge</span>
            </button>
          </div>
        </div>

        {/* ── FLOATING SEARCH & AVAILABILITY BAR ───────────────────────────── */}
        <div
          style={{
            maxWidth: 1040,
            width: '100%',
            margin: '0 auto',
            background: 'var(--tp-surf, #0c130c)',
            border: '1.5px solid var(--tp-line, #16a34a)',
            borderRadius: 20,
            padding: '18px 22px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6), var(--tp-sh, 0 0 20px rgba(34,197,94,0.15))',
            zIndex: 10
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tp-mute, #86a882)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Calendar size={13} /> Check-In Date
              </label>
              <input
                type="date"
                className="form-control"
                style={{ padding: '8px 10px', fontSize: 13, background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)', border: '1px solid var(--tp-line, #334155)', borderRadius: 8 }}
                value={searchCheckIn}
                onChange={e => setSearchCheckIn(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tp-mute, #86a882)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Calendar size={13} /> Check-Out Date
              </label>
              <input
                type="date"
                className="form-control"
                style={{ padding: '8px 10px', fontSize: 13, background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)', border: '1px solid var(--tp-line, #334155)', borderRadius: 8 }}
                value={searchCheckOut}
                onChange={e => setSearchCheckOut(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tp-mute, #86a882)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Users size={13} /> Guests
              </label>
              <select
                className="form-control"
                style={{ padding: '8px 10px', fontSize: 13, background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)', border: '1px solid var(--tp-line, #334155)', borderRadius: 8 }}
                value={searchGuests}
                onChange={e => setSearchGuests(e.target.value)}
              >
                <option value="1">1 Guest</option>
                <option value="2">2 Guests</option>
                <option value="3">3 Guests</option>
                <option value="4">4+ Guests (VIP Family)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tp-mute, #86a882)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Compass size={13} /> Room Category
              </label>
              <select
                className="form-control"
                style={{ padding: '8px 10px', fontSize: 13, background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)', border: '1px solid var(--tp-line, #334155)', borderRadius: 8 }}
                value={searchType}
                onChange={e => setSearchType(e.target.value)}
              >
                <option value="all">All Room Types</option>
                <option value="single">Single Room</option>
                <option value="double">Double Room</option>
                <option value="deluxe">Deluxe Room</option>
                <option value="suite">Executive Suite</option>
                <option value="penthouse">Royal Penthouse</option>
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={() => {
                  toast.success(`Found ${filteredRooms.length} luxury rooms matching your criteria!`)
                  const el = document.getElementById('rooms-section')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '9px 16px',
                  fontWeight: 800,
                  fontSize: 13.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <span>Find Rooms</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── KEY HIGHLIGHTS STATS BAR ────────────────────────────────────────── */}
      <section style={{ maxWidth: 1140, margin: '40px auto 20px', padding: '0 20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16
          }}
        >
          <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BedDouble size={22} color="var(--tp-acc, #22c55e)" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tp-ink, #fff)' }}>18 Luxury Suites</div>
              <div style={{ fontSize: 12, color: 'var(--tp-mute, #86a882)' }}>From Deluxe to Penthouse</div>
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={22} color="#38bdf8" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tp-ink, #fff)' }}>24/7 AI Concierge</div>
              <div style={{ fontSize: 12, color: 'var(--tp-mute, #86a882)' }}>Bilingual English & አማርኛ</div>
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={22} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tp-ink, #fff)' }}>Direct Payment</div>
              <div style={{ fontSize: 12, color: 'var(--tp-mute, #86a882)' }}>Telebirr, Chapa & CBE Birr</div>
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Utensils size={22} color="#c084fc" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tp-ink, #fff)' }}>Exquisite Dining</div>
              <div style={{ fontSize: 12, color: 'var(--tp-mute, #86a882)' }}>Traditional & International</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6-FLOOR ARCHITECTURAL SHOWCASE & BOTANICAL PARK ─────────────────── */}
      <section id="building-park-section" style={{ maxWidth: 1140, margin: '20px auto 40px', padding: '0 20px' }}>
        <HotelBuildingParkShowcase
          onSelectRoom={(r) => handleOpenBooking(r)}
          onOpenAI={(q) => {
            window.dispatchEvent(new CustomEvent('open-hotel-ai', { detail: { query: q } }))
          }}
        />
      </section>

      {/* ── COMFORTABLE WITH OUR HOTEL & PARK? REGISTER CALLOUT ────────────── */}
      {!user && (
        <section style={{ maxWidth: 1140, margin: '10px auto 40px', padding: '0 20px' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.14) 0%, rgba(56, 189, 248, 0.08) 100%)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              borderRadius: 20,
              padding: '30px 32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 20,
              boxShadow: '0 10px 30px rgba(0,0,0,0.45)'
            }}
          >
            <div style={{ maxWidth: 660 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 99,
                  background: 'rgba(34, 197, 94, 0.22)',
                  color: '#22c55e',
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 10
                }}
              >
                ✨ Comfortable with our 6-Floor Hotel & Resort Park?
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: '0 0 8px 0', letterSpacing: '-0.01em' }}>
                Register Your Customer Account in 30 Seconds
              </h3>
              <p style={{ color: '#cbd5e1', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                Now that you have visited our 6-floor architectural building, executive suites, botanical park gardens, and authentic Ethiopian dining feasts — feel free to register your guest account to enjoy instant reservations, room selection, and digital bill settlement via Telebirr & CBE Birr.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Link
                to="/register"
                className="btn btn-primary"
                style={{
                  padding: '12px 26px',
                  fontSize: 14.5,
                  fontWeight: 800,
                  borderRadius: 30,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 16px rgba(34, 197, 94, 0.35)'
                }}
              >
                <Users size={16} />
                <span>Register Customer</span>
              </Link>
              <Link
                to="/login"
                className="btn btn-outline"
                style={{
                  padding: '12px 22px',
                  fontSize: 13.5,
                  fontWeight: 700,
                  borderRadius: 30
                }}
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── FEATURED LUXURY ROOMS & SUITES SECTION ─────────────────────────── */}
      <section id="rooms-section" style={{ maxWidth: 1140, margin: '40px auto 60px', padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <div className="tp-eyebrow" style={{ color: 'var(--tp-acc, #22c55e)', marginBottom: 4 }}>
              LUXURY ACCOMMODATION
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--tp-ink, #fff)' }}>
              Explore Our Handcrafted Rooms & Suites
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--tp-mute, #86a882)' }}>
              Showing {filteredRooms.length} available suites
            </span>
          </div>
        </div>

        {loadingRooms ? (
          <div style={{ textAlign: 'center', padding: 50, color: 'var(--tp-mute, #86a882)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Loading rooms...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {filteredRooms.map(room => {
              const isBooked = room.status === 'occupied' || Number(room.is_booked) === 1 || room.status === 'booked'
              const isAvailable = room.status === 'available' && !isBooked
              const statusDisplay = isBooked ? 'Occupied' : (isAvailable ? 'Available' : room.status)
              const priceNum = Number(room.price_per_night) || 0
              const amenitiesList = room.amenities ? room.amenities.split(',').map(s => s.trim()) : ['WiFi', 'Smart TV', 'AC']

              return (
                <div
                  key={room.id}
                  className="card"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: '1.5px solid var(--tp-line, #334155)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.5)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ position: 'relative', height: 180, overflow: 'hidden' }}>
                    <img
                      src={
                        room.type === 'penthouse' ? hotelBuildingImg :
                        room.type === 'suite' ? diningImg :
                        drinksImg
                      }
                      alt={room.room_number}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        background: isBooked ? 'rgba(239,68,68,0.95)' : 'rgba(34,197,94,0.95)',
                        color: isBooked ? '#ffffff' : '#050805',
                        backdropFilter: 'blur(4px)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                      }}
                    >
                      {statusDisplay}
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        bottom: 12,
                        left: 12,
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 800,
                        background: 'rgba(5,8,5,0.85)',
                        color: 'var(--tp-acc, #22c55e)',
                        border: '1px solid var(--tp-line, #22c55e)'
                      }}
                    >
                      Floor {room.floor} • Room #{room.room_number}
                    </div>
                  </div>

                  <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <h3 style={{ fontSize: 17, fontWeight: 800, textTransform: 'capitalize', color: 'var(--tp-ink, #fff)' }}>
                          {room.type} Suite
                        </h3>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--tp-acc, #22c55e)' }}>
                            ETB {priceNum.toFixed(2)}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--tp-mute, #86a882)', display: 'block' }}>/ night</span>
                        </div>
                      </div>

                      <p style={{ fontSize: 12.5, color: 'var(--tp-mute, #86a882)', lineHeight: 1.5, marginBottom: 14 }}>
                        {room.description || `Comfortable ${room.type} suite with scenic hotel views, premium linens, and high-speed Wi-Fi.`}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tp-mute, #86a882)', marginBottom: 12 }}>
                        <span>👥 Max {room.max_guests || 2} guests capacity</span>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                        {amenitiesList.slice(0, 4).map((amenity, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: 10.5,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'var(--tp-surf-2, rgba(255,255,255,0.06))',
                              border: '1px solid var(--tp-line, rgba(255,255,255,0.1))',
                              color: 'var(--tp-ink, #e2e8f0)'
                            }}
                          >
                            ✓ {amenity}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isBooked}
                      onClick={() => handleOpenBooking(room)}
                      className={isBooked ? "btn btn-outline" : "btn btn-primary"}
                      style={{
                        width: '100%',
                        fontWeight: 700,
                        fontSize: 13,
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        opacity: isBooked ? 0.6 : 1,
                        cursor: isBooked ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <BedDouble size={16} />
                      <span>{isBooked ? 'Occupied' : 'Available'}</span>
                      {!isBooked && <ArrowRight size={15} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── ETHIOPIAN DINING & BEVERAGE BANNER ───────────────────────────────── */}
      <section style={{ maxWidth: 1140, margin: '40px auto 60px', padding: '0 20px' }}>
        <div
          className="card"
          style={{
            padding: 0,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            background: 'var(--tp-surf, #0c130c)',
            border: '1.5px solid var(--tp-line, #16a34a)'
          }}
        >
          <div style={{ padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span className="tp-eyebrow" style={{ color: '#f59e0b', marginBottom: 6 }}>
              AUTHENTIC ETHIOPIAN & GLOBAL DINING
            </span>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--tp-ink, #fff)', marginBottom: 12 }}>
              Savor Gourmet Traditional Dishes & Fine Beverages
            </h2>
            <p style={{ fontSize: 13.5, color: 'var(--tp-mute, #86a882)', lineHeight: 1.6, marginBottom: 20 }}>
              Taste the rich flavors of Ethiopian culinary art: slow-cooked <strong>Doro Wat (ዶሮ ወጥ)</strong>, special seasoned <strong>Kitfo (ክትፎ)</strong>, sizzling <strong>Shiro Tegabino</strong>, prime ribeye steaks, cold draft <strong>Habesha & St. George beers</strong>, and freshly roasted <strong>Ethiopian highland Arabica coffee</strong>.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/dining" className="btn btn-primary" style={{ fontWeight: 700 }}>
                <Utensils size={16} /> View Full Dining Menu
              </Link>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-hotel-ai', { detail: { query: 'What food and drink menu items do you recommend for dinner?' } }))
                }}
                className="btn btn-outline"
                style={{ fontWeight: 600 }}
              >
                <Sparkles size={16} /> Ask AI Recommendations
              </button>
            </div>
          </div>

          <div style={{ minHeight: 280, position: 'relative' }}>
            <img
              src={diningImg}
              alt="Dining Experience"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        </div>
      </section>

      {/* ── 24/7 BILINGUAL HOTEL AI CONCIERGE PROMO ─────────────────────────── */}
      <section style={{ maxWidth: 1140, margin: '40px auto 60px', padding: '0 20px' }}>
        <div
          style={{
            padding: '30px 32px',
            borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(2,132,199,0.18), rgba(16,185,129,0.18))',
            border: '1.5px solid rgba(56,189,248,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 20
          }}
        >
          <div style={{ maxWidth: 650 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ padding: '3px 10px', borderRadius: 20, background: '#0284c7', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                AI CONCIERGE 3.0
              </span>
              <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600 }}>
                English & አማርኛ Natural Language
              </span>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
              Instant Answers, Room Predictions & Dining Recommendations
            </h3>
            <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
              Ask anything anytime: Check available rooms for your travel dates, verify check-out time, learn about pool hours, calculate reservation balances, or receive custom food pairings.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-hotel-ai', { detail: { query: 'ሰላም! ዛሬ ምን ክፍት ክፍሎች አሉ?' } }))
            }}
            className="btn btn-primary"
            style={{
              padding: '12px 24px',
              fontSize: 14,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 8px 20px rgba(2,132,199,0.3)'
            }}
          >
            <Sparkles size={17} />
            <span>Chat With Hotel AI Now</span>
          </button>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: '1px solid var(--tp-line, rgba(255,255,255,0.12))',
          padding: '40px 24px',
          background: 'var(--tp-surf, #0c130c)',
          textAlign: 'center'
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
            <Hotel size={22} color="var(--tp-acc, #22c55e)" />
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--tp-ink, #fff)' }}>Grand Hotel & Luxury Suites</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--tp-mute, #86a882)', marginBottom: 18 }}>
            Addis Ababa, Ethiopia • 24/7 Reception Desk: 0932338138 • befather7@gmail.com
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, color: 'var(--tp-mute, #86a882)', marginBottom: 20 }}>
            <Link to="/dining">Dining & Bar</Link>
            <span>•</span>
            <Link to="/my-bookings">My Bookings</Link>
            <span>•</span>
            <Link to="/login">Sign In</Link>
            <span>•</span>
            <Link to="/register">Create Account</Link>
          </div>
          <div style={{ fontSize: 11, color: 'var(--tp-mute, #64748b)' }}>
            © {new Date().getFullYear()} HotelMS Management System. Developed with modern luxury tokens and responsive architecture.
          </div>
        </div>
      </footer>

      {/* ── DIRECT RESERVATION MODAL ─────────────────────────────────────────── */}
      {bookingModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1300
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 580,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1.5px solid var(--tp-line, #22c55e)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
              padding: 24,
              borderRadius: 18,
              background: 'var(--tp-surf, #0c130c)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--tp-line, #334155)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BedDouble size={20} color="var(--tp-acc, #22c55e)" />
                <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--tp-ink, #fff)' }}>
                  Reserve Suite #{selectedRoom?.room_number || form.room_id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBookingModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--tp-mute, #86a882)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {!user && (
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 16,
                  fontSize: 12.5,
                  color: '#bae6fd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap'
                }}
              >
                <span>✨ Enjoying our Hotel & Park? Register or sign in to track your reservation.</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Link to="/register" className="btn btn-xs btn-primary" style={{ fontWeight: 700 }}>
                    Register
                  </Link>
                  <Link to="/login" className="btn btn-xs btn-outline" style={{ fontWeight: 600 }}>
                    Sign In
                  </Link>
                </div>
              </div>
            )}

            <form onSubmit={handleBookingSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tp-mute, #86a882)' }}>Guest Full Name *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Abebe Bikila"
                    style={{ background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tp-mute, #86a882)' }}>Phone Number *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="09..."
                    style={{ background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tp-mute, #86a882)' }}>Check-in Date *</label>
                  <input
                    type="date"
                    required
                    className="form-control"
                    value={form.check_in}
                    onChange={e => setForm({ ...form, check_in: e.target.value })}
                    style={{ background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tp-mute, #86a882)' }}>Check-out Date *</label>
                  <input
                    type="date"
                    required
                    className="form-control"
                    value={form.check_out}
                    onChange={e => setForm({ ...form, check_out: e.target.value })}
                    style={{ background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tp-mute, #86a882)' }}>Guests (Adults) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="form-control"
                    value={form.adults || 1}
                    onChange={e => setForm({ ...form, adults: Number(e.target.value) || 1 })}
                    style={{ background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tp-mute, #86a882)' }}>Children</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={form.children || 0}
                    onChange={e => setForm({ ...form, children: Number(e.target.value) || 0 })}
                    style={{ background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)' }}
                  />
                </div>
              </div>

              {selectedRoom && ((Number(form.adults) || 1) + (Number(form.children) || 0)) > (selectedRoom.max_guests || 2) && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1.5px solid #ef4444',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#f87171',
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 12
                }}>
                  ⚠️ Capacity exceeded: Room #{selectedRoom.room_number} accommodates up to {selectedRoom.max_guests || 2} guests (You selected {(Number(form.adults) || 1) + (Number(form.children) || 0)} guests).
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tp-mute, #86a882)' }}>Select Suite / Room *</label>
                  <select
                    className="form-control"
                    value={form.room_id}
                    onChange={e => {
                      const r = rooms.find(item => String(item.id) === e.target.value)
                      setSelectedRoom(r)
                      setForm({ ...form, room_id: e.target.value, payment_amount: r?.price_per_night || '' })
                    }}
                    style={{ background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)' }}
                  >
                    {rooms.map(r => {
                      const isBooked = r.status === 'occupied' || Number(r.is_booked) === 1
                      const statusTag = isBooked ? 'Occupied' : (r.status === 'available' ? 'Available' : r.status)
                      return (
                        <option key={r.id} value={r.id} disabled={isBooked || r.status === 'maintenance'}>
                          Room #{r.room_number} ({r.type} - Floor {r.floor}) [{statusTag}] • Max {r.max_guests || 2} guests • ETB {r.price_per_night}
                        </option>
                      )
                    })}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tp-mute, #86a882)' }}>Payment Method *</label>
                  <select
                    className="form-control"
                    value={form.payment_method}
                    onChange={e => setForm({ ...form, payment_method: e.target.value })}
                    style={{ background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)' }}
                  >
                    {PAYMENT_METHODS.map(m => (
                      <option key={m.value} value={m.value}>
                        {m.icon} {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--tp-mute, #86a882)' }}>Special Requests or Notes</label>
                <textarea
                  rows="2"
                  className="form-control"
                  value={form.special_requests}
                  onChange={e => setForm({ ...form, special_requests: e.target.value })}
                  placeholder="e.g. Airport pickup, quiet floor, extra pillows..."
                  style={{ background: 'var(--tp-surf-2, #142014)', color: 'var(--tp-ink, #fff)' }}
                />
              </div>

              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid var(--tp-line, #22c55e)', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--tp-ink, #fff)', fontWeight: 600 }}>Nightly Rate:</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--tp-acc, #22c55e)' }}>
                    ETB {Number(form.payment_amount || selectedRoom?.price_per_night || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setBookingModal(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBooking}
                  className="btn btn-primary"
                  style={{ fontWeight: 800, padding: '10px 20px' }}
                >
                  {submittingBooking ? 'Confirming...' : 'Confirm Reservation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 24/7 Bilingual Hotel AI Concierge Widget */}
      <HotelAIWidget onSelectRoom={(r) => handleOpenBooking(r)} />
    </div>
  )
}
