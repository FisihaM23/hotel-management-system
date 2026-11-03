import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Hotel, Star, Sparkles, BedDouble, Compass,
  ArrowRight, ChevronDown, Menu, X, User,
  Calendar, Trees, Utensils, Award
} from 'lucide-react'
import HotelVideoControls from './HotelVideoControls'
import ThemeSelector from './ThemeSelector'
import '../styles/HotelHomepageHero.css'

export default function HotelHomepageHero({
  onExploreHotel,
  onBookStay,
  user
}) {
  const containerRef = useRef(null)
  const videoRef = useRef(null)

  // Video playback states
  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(28)
  const [videoError, setVideoError] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)

  // Navigation scroll state
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Track scroll position to darken nav bar
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 40) {
        setIsScrolled(true)
      } else {
        setIsScrolled(false)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Callback ref to attach video element and trigger autoplay synchronously
  const handleVideoRef = (el) => {
    if (el) {
      videoRef.current = el
      el.muted = true
      el.defaultMuted = true
      el.playsInline = true
      el.autoplay = true
      el.setAttribute('muted', '')
      el.setAttribute('autoplay', '')
      el.setAttribute('playsinline', '')

      try {
        const p = el.play()
        if (p && typeof p.then === 'function') {
          p.then(() => {
            setIsPlaying(true)
            setVideoLoaded(true)
          }).catch(() => {
            el.muted = true
            el.play().then(() => {
              setIsPlaying(true)
              setVideoLoaded(true)
            }).catch(() => {})
          })
        }
      } catch (_) {}
    }
  }

  // Continuously ensure video wave starts immediately on load and on visibility
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('muted', '')
    video.setAttribute('autoplay', '')
    video.setAttribute('playsinline', '')

    const triggerPlay = () => {
      if (video && video.paused) {
        const p = video.play()
        if (p && typeof p.then === 'function') {
          p.then(() => {
            setIsPlaying(true)
            setVideoLoaded(true)
          }).catch(() => {
            video.muted = true
            video.play().then(() => {
              setIsPlaying(true)
              setVideoLoaded(true)
            }).catch(() => {})
          })
        }
      }
    }

    triggerPlay()

    // Immediate timed retries for instant startup across fast/slow connections
    const t1 = setTimeout(triggerPlay, 50)
    const t2 = setTimeout(triggerPlay, 200)
    const t3 = setTimeout(triggerPlay, 600)

    video.addEventListener('canplay', triggerPlay)
    video.addEventListener('loadeddata', triggerPlay)
    video.addEventListener('loadedmetadata', triggerPlay)
    video.addEventListener('playing', () => {
      setIsPlaying(true)
      setVideoLoaded(true)
    })

    const handleVisibility = () => {
      if (!document.hidden && video && video.paused) {
        triggerPlay()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)

    const handleFirstGesture = () => {
      if (video && video.paused) {
        triggerPlay()
      }
    }
    window.addEventListener('click', handleFirstGesture, { passive: true })
    window.addEventListener('scroll', handleFirstGesture, { passive: true })
    window.addEventListener('touchstart', handleFirstGesture, { passive: true })
    window.addEventListener('mousemove', handleFirstGesture, { once: true, passive: true })

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      video.removeEventListener('canplay', triggerPlay)
      video.removeEventListener('loadeddata', triggerPlay)
      video.removeEventListener('loadedmetadata', triggerPlay)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
      window.removeEventListener('click', handleFirstGesture)
      window.removeEventListener('scroll', handleFirstGesture)
      window.removeEventListener('touchstart', handleFirstGesture)
      window.removeEventListener('mousemove', handleFirstGesture)
    }
  }, [])

  // Sync video time and duration
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 25)
      setVideoLoaded(true)
    }
  }

  // Play / Pause toggle
  const handleTogglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.log('Video play error:', err))
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }

  // Mute / Unmute toggle
  const handleToggleMute = () => {
    if (!videoRef.current) return
    videoRef.current.muted = !videoRef.current.muted
    setIsMuted(videoRef.current.muted)
  }

  // Replay
  const handleReplay = () => {
    if (!videoRef.current) return
    videoRef.current.currentTime = 0
    videoRef.current.play()
      .then(() => setIsPlaying(true))
      .catch(() => {})
  }

  // Seek / jump to scene
  const handleSeek = (timeInSeconds) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = timeInSeconds
    if (videoRef.current.paused) {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => {})
    }
  }

  // Smooth scroll helper
  const scrollToSection = (id) => {
    setMobileMenuOpen(false)
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Action triggers
  const handleExploreClick = (e) => {
    e.preventDefault()
    if (onExploreHotel) {
      onExploreHotel()
    } else {
      scrollToSection('building-park-section')
    }
  }

  const handleBookClick = (e) => {
    e.preventDefault()
    if (onBookStay) {
      onBookStay()
    } else {
      scrollToSection('rooms-section')
    }
  }

  return (
    <section
      ref={containerRef}
      id="hero-section"
      className="hotel-hero-section"
      aria-label="Luxury 6-Floor Hotel Video Showcase"
    >
      {/* ── 1. CINEMATIC BACKGROUND VIDEO / FALLBACK IMAGE ───────────────── */}
      <div className="hotel-hero-video-wrapper">
        <video
          ref={handleVideoRef}
          src="/videos/hotel-cinematic-tour.mp4"
          className={`hotel-hero-video ${!isPlaying ? 'video-paused' : ''}`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/images/hotel-landscape.jpg"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => {
            if (videoRef.current && videoRef.current.paused) {
              videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onError={() => {
            console.warn('Video failed to load or play, falling back to hotel landscape image.')
            setVideoError(true)
          }}
        >
          <source src="/videos/hotel-cinematic-tour.mp4" type="video/mp4" />
        </video>

        {/* Fallback image shown ONLY if video encounters a fatal load error */}
        {videoError && (
          <div
            className="hotel-hero-fallback-bg"
            style={{ backgroundImage: `url('/images/hotel-landscape.jpg')` }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* ── 2. VIDEO-WAVE & CINEMATIC DEPTH OVERLAYS ────────────────────── */}
      <div className="hotel-hero-overlay" aria-hidden="true" />
      <div className="hotel-hero-video-waves" aria-hidden="true" />
      <div className="hotel-hero-wave-stream" aria-hidden="true" />
      <div className="hotel-hero-sunlight-flare" aria-hidden="true" />
      <div className="hotel-hero-vignette" aria-hidden="true" />

      {/* ── 3. PREMIUM TRANSPARENT NAVIGATION BAR ───────────────────────── */}
      <nav
        className={`hotel-hero-nav ${isScrolled ? 'nav-scrolled' : ''} ${mobileMenuOpen ? 'nav-mobile-open' : ''}`}
        aria-label="Main Navigation"
      >
        {/* Brand Logo */}
        <Link to="/" className="hotel-nav-brand">
          <div className="hotel-nav-logo-badge">
            <Hotel size={24} className="text-gold" />
          </div>
          <div>
            <div className="hotel-nav-brand-name">
              Grand Hotel <span className="gold-star">★</span>
            </div>
            <div className="hotel-nav-brand-tagline">
              6-Floor Luxury & Resort Park
            </div>
          </div>
        </Link>

        {/* Navigation Links (Desktop) */}
        <ul className="hotel-nav-links">
          <li>
            <a
              href="#hero-section"
              className="hotel-nav-link"
              onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            >
              Home
            </a>
          </li>
          <li>
            <a
              href="#rooms-section"
              className="hotel-nav-link"
              onClick={(e) => { e.preventDefault(); scrollToSection('rooms-section') }}
            >
              Rooms
            </a>
          </li>
          <li>
            <a
              href="#services-section"
              className="hotel-nav-link"
              onClick={(e) => { e.preventDefault(); scrollToSection('services-section') }}
            >
              Services
            </a>
          </li>
          <li>
            <Link to="/dining" className="hotel-nav-link">
              Restaurant
            </Link>
          </li>
          <li>
            <a
              href="#building-park-section"
              className="hotel-nav-link"
              onClick={(e) => { e.preventDefault(); scrollToSection('building-park-section') }}
            >
              About Us
            </a>
          </li>
          <li>
            <a
              href="#contact-section"
              className="hotel-nav-link"
              onClick={(e) => { e.preventDefault(); scrollToSection('contact-section') }}
            >
              Contact
            </a>
          </li>
        </ul>

        {/* Action Controls & Auth */}
        <div className="hotel-nav-actions">
          <ThemeSelector variant="dropdown" align="right" />

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link
                to={user.role === 'customer' ? '/my-bookings' : '/dashboard'}
                className="hotel-nav-login-btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <User size={15} className="text-gold" />
                <span>{user.name.split(' ')[0]}</span>
              </Link>
            </div>
          ) : (
            <Link to="/login" className="hotel-nav-login-btn">
              Login
            </Link>
          )}

          <button
            type="button"
            className="hotel-nav-book-btn"
            onClick={handleBookClick}
          >
            <Calendar size={14} />
            <span>Book Now</span>
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            className="hotel-nav-mobile-toggle"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* ── 4. HOMEPAGE HERO TITLE & CALL TO ACTIONS ─────────────────────── */}
      <div className="hotel-hero-content">
        {/* Grand Escape Hotel in Ethiopia - Animated from Left to Right */}
        <h1 className="hotel-hero-title-words" aria-label="Grand Escape Hotel in Ethiopia">
          {['Grand', 'Escape', 'Hotel', 'in', 'Ethiopia'].map((word, idx) => (
            <span
              key={idx}
              className="hotel-anim-word"
              style={{
                animationDelay: `${idx * 0.2 + 0.15}s, 1.4s`
              }}
            >
              {word}
            </span>
          ))}
        </h1>

        {/* Two Prominent Buttons (Words preserved) */}
        <div className="hotel-hero-cta-group">
          <button
            type="button"
            className="hotel-hero-btn-primary"
            onClick={handleBookClick}
          >
            <BedDouble size={18} />
            <span>BOOK YOUR STAY</span>
            <ArrowRight size={17} />
          </button>

          <button
            type="button"
            className="hotel-hero-btn-secondary"
            onClick={handleExploreClick}
          >
            <Compass size={18} className="text-gold" />
            <span>EXPLORE OUR HOTEL</span>
          </button>
        </div>
      </div>

      {/* ── 5. ANIMATED SCROLL INDICATOR ────────────────────────────────── */}
      <a
        href="#building-park-section"
        className="hotel-hero-scroll-indicator"
        onClick={handleExploreClick}
        aria-label="Scroll to explore hotel"
      >
        <div className="scroll-mouse">
          <div className="scroll-wheel" />
        </div>
        <span className="scroll-text">Scroll to Explore</span>
        <ChevronDown size={14} className="text-gold" />
      </a>

      {/* ── 6. CINEMATIC VIDEO CONTROLS DOCK ────────────────────────────── */}
      <HotelVideoControls
        videoRef={videoRef}
        containerRef={containerRef}
        isPlaying={isPlaying}
        isMuted={isMuted}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={handleTogglePlay}
        onToggleMute={handleToggleMute}
        onReplay={handleReplay}
        onSeek={handleSeek}
      />
    </section>
  )
}

