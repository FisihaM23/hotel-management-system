/**
 * Email validation utility enforcing trusted domains (@gmail.com and @icloud.com).
 * Enforces that username before @ must contain letters (words or word with numbers);
 * using only numbers before @ (e.g. 123456@gmail.com) is strictly rejected as invalid.
 */
export const ALLOWED_EMAIL_DOMAINS = ['gmail.com', 'icloud.com', 'hotel.com']

export const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false
    const trimmed = email.trim()
    // Must contain letters before @ (cannot be numbers only) and end with @gmail.com or @icloud.com (or @hotel.com)
    const regex = /^(?=[^@]*[a-zA-Z])[a-zA-Z0-9._%+-]+@(gmail\.com|icloud\.com|hotel\.com)$/i
    return regex.test(trimmed)
}

export const EMAIL_POLICY_MESSAGE = 'Email must contain letters (words or word with numbers) and end with @gmail.com or @icloud.com (only numbers before @ is invalid, e.g. name@gmail.com)'
