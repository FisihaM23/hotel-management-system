import { createContext, useContext, useEffect, useState } from 'react'
import safeStorage from '../utils/storage'

export const THEMES = {
  emerald: {
    id: 'emerald',
    name: 'Emerald Garden',
    description: 'Botanical deep green & neon mint',
    hue: 140,
    colorScheme: 'dark',
    accentColor: '#22c55e',
    accInk: '#041d0a',
    previewGradient: 'linear-gradient(135deg, #10b981, #059669)',
    bg: '#050805',
    surf: '#0c130c',
    surf2: '#142014',
    ink: '#e7ffe4',
    mute: '#86a882',
    line: '#1e3820',
    icon: '🌿'
  },
  sapphire: {
    id: 'sapphire',
    name: 'Royal Sapphire',
    description: 'Midnight navy & electric ocean blue',
    hue: 245,
    colorScheme: 'dark',
    accentColor: '#38bdf8',
    accInk: '#02131e',
    previewGradient: 'linear-gradient(135deg, #38bdf8, #2563eb)',
    bg: '#030712',
    surf: '#0b1329',
    surf2: '#111c3d',
    ink: '#f0f9ff',
    mute: '#7dd3fc',
    line: '#1e293b',
    icon: '💎'
  },
  glacier: {
    id: 'glacier',
    name: 'Glacier Cyan',
    description: 'Arctic iceberg turquoise & crisp aurora',
    hue: 195,
    colorScheme: 'dark',
    accentColor: '#22d3ee',
    accInk: '#02141a',
    previewGradient: 'linear-gradient(135deg, #22d3ee, #0284c7)',
    bg: '#02070a',
    surf: '#06151f',
    surf2: '#0b202e',
    ink: '#ecfeff',
    mute: '#67e8f9',
    line: '#163042',
    icon: '🌊'
  },
  pearl: {
    id: 'pearl',
    name: 'Pearl Daylight',
    description: 'Modern hotel daylight & elegant ivory',
    hue: 155,
    colorScheme: 'light',
    accentColor: '#059669',
    accInk: '#ffffff',
    previewGradient: 'linear-gradient(135deg, #10b981, #047857)',
    bg: '#f8fafc',
    surf: '#ffffff',
    surf2: '#f1f5f9',
    ink: '#090d16',
    mute: '#334155',
    line: '#cbd5e1',
    icon: '☀️'
  }
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => {
    try {
      const saved = safeStorage.getItem('hms_theme')
      return (saved && THEMES[saved]) ? saved : 'emerald'
    } catch {
      return 'emerald'
    }
  })

  const applyThemeTokens = (id) => {
    const config = THEMES[id] || THEMES.emerald
    const root = document.documentElement

    root.setAttribute('data-theme', config.id === 'emerald' ? 'glitch-garden' : config.id)
    root.style.setProperty('--tp-h', String(config.hue))
    root.style.setProperty('--tp-bg', config.bg)
    root.style.setProperty('--tp-canvas', config.bg)
    root.style.setProperty('--tp-surf', config.surf)
    root.style.setProperty('--tp-surf-2', config.surf2)
    root.style.setProperty('--tp-ink', config.ink)
    root.style.setProperty('--tp-mute', config.mute)
    root.style.setProperty('--tp-line', config.line)
    root.style.setProperty('--tp-acc', config.accentColor)
    root.style.setProperty('--tp-acc-2', config.accentColor)
    root.style.setProperty('--tp-acc-ink', config.accInk || '#ffffff')
    root.style.setProperty('--tp-grad', config.previewGradient || `linear-gradient(135deg, ${config.accentColor}, ${config.accentColor})`)
    root.style.setProperty('color-scheme', config.colorScheme || 'dark')

    safeStorage.setItem('hms_theme', config.id)
  }

  const setTheme = (id) => {
    if (THEMES[id]) {
      setThemeId(id)
      applyThemeTokens(id)
    }
  }

  useEffect(() => {
    applyThemeTokens(themeId)
  }, [themeId])

  return (
    <ThemeContext.Provider value={{
      themeId,
      currentTheme: THEMES[themeId] || THEMES.emerald,
      themes: Object.values(THEMES),
      setTheme
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
