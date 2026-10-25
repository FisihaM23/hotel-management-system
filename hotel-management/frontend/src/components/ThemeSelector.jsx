import { useState, useRef, useEffect } from 'react'
import { Palette, Check, Sparkles, Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function ThemeSelector({ variant = 'dropdown', align = 'right' }) {
  const { themeId, currentTheme, themes, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  if (variant === 'pills') {
    return (
      <div className="theme-pills-bar" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {themes.map(t => {
          const isActive = t.id === themeId
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`theme-pill-btn ${isActive ? 'active' : ''}`}
              title={`${t.name} — ${t.description}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                border: isActive ? `2px solid ${t.accentColor}` : '1px solid var(--tp-line, rgba(255,255,255,0.15))',
                background: isActive ? 'var(--tp-surf-2, rgba(255,255,255,0.08))' : 'transparent',
                color: isActive ? 'var(--tp-ink, #fff)' : 'var(--tp-mute, #94a3b8)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? `0 0 12px ${t.accentColor}40` : 'none'
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: t.previewGradient,
                  boxShadow: `0 0 6px ${t.accentColor}80`
                }}
              />
              <span>{t.name}</span>
              {isActive && <Check size={13} color={t.accentColor} />}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="theme-selector-wrapper" ref={menuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="theme-toggle-trigger"
        aria-label="Change interface theme color"
        title={`Theme: ${currentTheme.name} (Click to change color)`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '6px 12px',
          borderRadius: 20,
          border: '1px solid var(--tp-line, #334155)',
          background: 'var(--tp-surf, #0f172a)',
          color: 'var(--tp-ink, #f8fafc)',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: `0 2px 8px ${currentTheme.accentColor}20`
        }}
      >
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: currentTheme.previewGradient,
            boxShadow: `0 0 8px ${currentTheme.accentColor}`
          }}
        />
        <Palette size={15} color={currentTheme.accentColor} />
        <span className="theme-name-label">{currentTheme.name}</span>
      </button>

      {open && (
        <div
          className="theme-dropdown-palette"
          style={{
            position: 'absolute',
            [align]: 0,
            top: 'calc(100% + 8px)',
            width: 260,
            padding: 10,
            background: 'var(--tp-surf, #0f172a)',
            border: '1px solid var(--tp-line, #334155)',
            borderRadius: 14,
            boxShadow: '0 16px 36px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.2)',
            zIndex: 1200,
            animation: 'tp-pop 0.15s ease-out'
          }}
        >
          <div
            style={{
              padding: '6px 8px 10px',
              borderBottom: '1px solid var(--tp-line, rgba(255,255,255,0.08))',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} color="var(--tp-acc, #38bdf8)" />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tp-ink, #fff)' }}>
                Interface Colors
              </span>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--tp-mute, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Instant Switch
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {themes.map(t => {
              const isSelected = t.id === themeId
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTheme(t.id)
                    setOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: isSelected ? `1.5px solid ${t.accentColor}` : '1px solid transparent',
                    background: isSelected ? 'var(--tp-surf-2, rgba(255,255,255,0.06))' : 'transparent',
                    color: 'var(--tp-ink, #fff)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--tp-surf-2, rgba(255,255,255,0.04))'
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: t.previewGradient,
                        flexShrink: 0,
                        boxShadow: `0 0 10px ${t.accentColor}60`,
                        border: '2px solid rgba(255,255,255,0.2)'
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: isSelected ? 700 : 500, color: isSelected ? t.accentColor : 'var(--tp-ink, #fff)' }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--tp-mute, #94a3b8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.description}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check size={15} color={t.accentColor} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
