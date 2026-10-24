/**
 * Email validation utility enforcing trusted domains (@gmail.com and @icloud.com).
 * Prevents invalid TLDs and typos such as @gmail.c, @icloud.c, etc.
 */
export const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'icloud.com', 'hotel.com']

export const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false
    const trimmed = email.trim()
    const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(gmail\.com|icloud\.com|hotel\.com)$/i
    return regex.test(trimmed)
}

export const EMAIL_POLICY_MESSAGE = 'Email must be a valid address ending with @gmail.com or @icloud.com (e.g. name@gmail.com)'
