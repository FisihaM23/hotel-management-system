import { createContext, useContext, useState } from 'react'
import safeStorage from '../utils/storage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            const stored = safeStorage.getItem('hms_user')
            const token = safeStorage.getItem('hms_token')
            if (stored && token) return JSON.parse(stored)
            return null
        } catch { return null }
    })

    const loginUser = (token, userData) => {
        safeStorage.setItem('hms_token', token)
        safeStorage.setItem('hms_user', JSON.stringify(userData))
        setUser(userData)
    }

    const logoutUser = () => {
        safeStorage.removeItem('hms_token')
        safeStorage.removeItem('hms_user')
        setUser(null)
        window.location.href = '/login'
    }

    return (
        <AuthContext.Provider value={{ user, loginUser, logoutUser }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
