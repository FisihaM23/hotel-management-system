import React, { useState, useEffect } from 'react'
import {
  Play, Pause, Volume2, VolumeX, RotateCcw,
  Maximize, Minimize, Film, Sparkles, ChevronRight
} from 'lucide-react'

const SCENES = [
  { id: 1, time: 0, title: '01. Grand 6-Floor Hotel Exterior', short: 'Exterior' },
  { id: 2, time: 3, title: '02. Grand Marble Lobby & Reception', short: 'Grand Lobby' },
  { id: 3, time: 6, title: '03. Royal Presidential Suite (King Bed)', short: 'Royal Suite' },
  { id: 4, time: 8, title: '04. Executive Living Suite & Lounge', short: 'Living Suite' },
  { id: 5, time: 11, title: '05. Deluxe Marble Spa & En-Suite Bath', short: 'Luxury Spa' },
  { id: 6, time: 14, title: '06. Michelin-Star Restaurant & Cuisine', short: 'Fine Dining' },
  { id: 7, time: 17, title: '07. Craft Cocktail Bar & Sky Lounge', short: 'Cocktail Bar' },
  { id: 8, time: 20, title: '08. Crystal Resort Pool & Loungers', short: 'Resort Pool' },
  { id: 9, time: 22, title: '09. Botanical Gardens & Fountains', short: 'Resort Gardens' },
  { id: 10, time: 25, title: '10. Complete 6-Floor Resort Panorama', short: 'Full Property' }
]

export default function HotelVideoControls({
  videoRef,
  containerRef,
  isPlaying,
  isMuted,
  currentTime,
  duration,
  onTogglePlay,
  onToggleMute,
  onReplay,
  onSeek
}) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSceneMenu, setShowSceneMenu] = useState(false)
  const [activeSceneIndex, setActiveSceneIndex] = useState(0)

  // Track active scene based on currentTime
  useEffect(() => {
    let currentIdx = 0
    for (let i = SCENES.length - 1; i >= 0; i--) {
      if (currentTime >= SCENES[i].time) {
        currentIdx = i
        break
      }
    }
    setActiveSceneIndex(currentIdx)
  }, [currentTime])

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  const toggleFullscreen = () => {
    const target = containerRef?.current || document.documentElement
    if (!document.fullscreenElement) {
      if (target.requestFullscreen) target.requestFullscreen().catch(() => {})
      else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen()
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {})
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
    }
  }

  const handleSceneJump = (sceneTime) => {
    if (onSeek) {
      onSeek(sceneTime)
    } else if (videoRef?.current) {
      videoRef.current.currentTime = sceneTime
      if (videoRef.current.paused) videoRef.current.play()
    }
    setShowSceneMenu(false)
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="hotel-video-controls-container" aria-label="Cinematic Hotel Video Controls">
      {/* Scene Jump Popup Drawer */}
      {showSceneMenu && (
        <div className="hotel-scenes-popover" role="dialog" aria-label="Cinematic Scenes">
          <div className="hotel-scenes-popover-header">
            <span className="hotel-scenes-title">
              <Film size={13} className="text-gold" />
              <span>10 Luxury Hotel Spaces & Rooms Tour</span>
            </span>
            <span className="hotel-scenes-badge">10 Spaces</span>
          </div>

          <div className="hotel-scenes-list">
            {SCENES.map((sc, idx) => {
              const isActive = activeSceneIndex === idx
              return (
                <button
                  key={sc.id}
                  type="button"
                  className={`hotel-scene-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleSceneJump(sc.time)}
                >
                  <span className="scene-num">{String(idx + 1).padStart(2, '0')}</span>
                  <div className="scene-details">
                    <span className="scene-label">{sc.title}</span>
                    <span className="scene-time">00:{String(sc.time).padStart(2, '0')}</span>
                  </div>
                  {isActive && <span className="scene-live-dot" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Main Bottom-Right Control Dock */}
      <div className="hotel-video-dock">
        {/* Active Scene Chip Button */}
        <button
          type="button"
          className="hotel-dock-btn hotel-scene-selector-btn"
          onClick={() => setShowSceneMenu(prev => !prev)}
          title="Browse all 10 internal rooms and luxury spaces"
          aria-expanded={showSceneMenu}
        >
          <Film size={14} className="text-gold" />
          <span className="dock-scene-text">{SCENES[activeSceneIndex]?.short || 'Tour Spaces'}</span>
          <span className="dock-scene-counter">{activeSceneIndex + 1}/10</span>
        </button>

        <div className="hotel-dock-divider" />

        {/* Play / Pause Toggle */}
        <button
          type="button"
          className="hotel-dock-btn hotel-dock-icon-btn"
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause continuous tour (Space)' : 'Play continuous tour (Space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
        </button>

        {/* Replay */}
        <button
          type="button"
          className="hotel-dock-btn hotel-dock-icon-btn"
          onClick={onReplay}
          title="Replay cinematic video tour from start"
          aria-label="Replay video"
        >
          <RotateCcw size={15} />
        </button>

        {/* Audio Mute / Unmute */}
        <button
          type="button"
          className="hotel-dock-btn hotel-dock-icon-btn"
          onClick={onToggleMute}
          title={isMuted ? 'Unmute video audio (M)' : 'Mute video audio (M)'}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={16} className="text-muted" /> : <Volume2 size={16} className="text-gold" />}
        </button>

        {/* Fullscreen Toggle */}
        <button
          type="button"
          className="hotel-dock-btn hotel-dock-icon-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen view (F)' : 'View full cinematic experience (F)'}
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
        </button>
      </div>

      {/* Micro Timeline Bar along the dock */}
      <div
        className="hotel-dock-progress"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const clickPos = (e.clientX - rect.left) / rect.width
          if (duration && onSeek) onSeek(clickPos * duration)
        }}
        title="Video tour timeline"
      >
        <div
          className="hotel-dock-progress-fill"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    </div>
  )
}
