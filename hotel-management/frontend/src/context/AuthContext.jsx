import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem('hms_user')
            const token = localStorage.getItem('hms_token')
            if (stored && token) return JSON.parse(stored)
            return null
        } catch { return null }
    })

    const loginUser = (token, userData) => {
        localStorage.setItem('hms_token', token)
        localStorage.setItem('hms_user', JSON.stringify(userData))
        setUser(userData)
    }

    const logoutUser = () => {
        localStorage.removeItem('hms_token')
        localStorage.removeItem('hms_user')
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
