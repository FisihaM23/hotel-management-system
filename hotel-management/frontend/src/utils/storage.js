/**
 * Universal Safe Storage Utility
 * 
 * Protects against DOMException / SecurityError thrown in:
 * 1. Mobile Simulator browser extensions (Chrome/Edge extension iframes with partitioned/sandboxed storage)
 * 2. Third-party iframe embeds
 * 3. Incognito / private browsing mode with blocked cookies
 * 4. Storage quota exceeded errors
 * 
 * Automatically falls back to an in-memory Map so all state
 * (tokens, user sessions, active theme, UI docks) continues functioning smoothly.
 */

const memoryStorage = new Map()

const isStorageUsable = (() => {
  if (typeof window === 'undefined') return false
  try {
    const testKey = '__hms_storage_test__'
    window.localStorage.setItem(testKey, testKey)
    window.localStorage.removeItem(testKey)
    return true
  } catch (err) {
    // Storage access is denied (e.g. extension iframe or restricted sandbox)
    return false
  }
})()

export const safeStorage = {
  /**
   * Safe getter for storage
   */
  getItem: (key) => {
    if (isStorageUsable) {
      try {
        return window.localStorage.getItem(key)
      } catch (e) {
        return memoryStorage.get(key) ?? null
      }
    }
    return memoryStorage.get(key) ?? null
  },

  /**
   * Safe setter for storage
   */
  setItem: (key, value) => {
    const stringVal = typeof value === 'string' ? value : String(value)
    if (isStorageUsable) {
      try {
        window.localStorage.setItem(key, stringVal)
        return
      } catch (e) {
        // Fallback to memory if setItem fails (e.g. QuotaExceeded or restricted)
        memoryStorage.set(key, stringVal)
        return
      }
    }
    memoryStorage.set(key, stringVal)
  },

  /**
   * Safe remover for storage
   */
  removeItem: (key) => {
    if (isStorageUsable) {
      try {
        window.localStorage.removeItem(key)
      } catch (e) {
        memoryStorage.delete(key)
        return
      }
    }
    memoryStorage.delete(key)
  },

  /**
   * Safe clear for storage
   */
  clear: () => {
    if (isStorageUsable) {
      try {
        window.localStorage.clear()
      } catch (e) {
        memoryStorage.clear()
        return
      }
    }
    memoryStorage.clear()
  },

  /**
   * Check if native persistent localStorage is actively working
   */
  isPersistent: () => isStorageUsable
}

export default safeStorage
