import toast from 'react-hot-toast'
import { initializeChapaPayment } from '../services/api'

export const CHAPA_PUBLIC_KEY = 'CHAPA_TEST_PUB_FJxLS1GQRO2GQUq1ek4XIyoyBvYuIWE9r0QPJCjs'

/**
 * Triggers Chapa Payment Gateway checkout using the configured public key.
 * Supports Chapa inline popup modal with graceful fallback to hosted redirect.
 */
export async function launchChapaCheckout({ bookingId, invoiceId, amount, name, email, phone }) {
    const toastId = toast.loading('Initializing Chapa Payment Gateway...')
    try {
        const payload = {}
        if (bookingId) payload.booking_id = Number(bookingId)
        if (invoiceId) payload.invoice_id = Number(invoiceId)
        if (amount) payload.amount = Number(amount)
        if (name) payload.name = name
        if (email) payload.email = email
        if (phone) payload.phone = phone

        const res = await initializeChapaPayment(payload)
        toast.dismiss(toastId)

        const data = res.data
        if (!data || !data.tx_ref) {
            throw new Error('Invalid response from payment server')
        }

        const pubKey = data.public_key || CHAPA_PUBLIC_KEY

        // 1. Try Chapa Inline Modal (if loaded from CDN)
        if (typeof window !== 'undefined' && window.ChapaCheckout) {
            try {
                const chapa = new window.ChapaCheckout({ publicKey: pubKey })
                chapa.checkout({
                    amount: data.amount,
                    currency: data.currency || 'ETB',
                    email: data.email || 'customer@hotel.com',
                    first_name: data.first_name || 'Valued',
                    last_name: data.last_name || 'Guest',
                    tx_ref: data.tx_ref,
                    title: data.title || `Hotel Booking #${data.booking_id || ''}`,
                    description: data.description || 'Hotel accommodation payment',
                    return_url: data.return_url,
                    callback_url: data.callback_url,
                    onSuccess: () => {
                        window.location.href = data.return_url
                    },
                    onClose: () => {
                        toast('Payment window closed')
                    }
                })
                return { success: true, method: 'inline', tx_ref: data.tx_ref }
            } catch (err) {
                console.warn('Chapa inline modal failed, using hosted redirect fallback', err)
            }
        }

        // 2. Fallback: Hosted Checkout redirect or simulated test gateway
        if (data.checkout_url) {
            window.location.href = data.checkout_url
            return { success: true, method: 'redirect', tx_ref: data.tx_ref }
        }

        // 3. Direct Return URL verification fallback
        if (data.return_url) {
            window.location.href = data.return_url
            return { success: true, method: 'return_url', tx_ref: data.tx_ref }
        }

        throw new Error('Unable to launch Chapa checkout')
    } catch (err) {
        toast.dismiss(toastId)
        const msg = err.response?.data?.error || err.message || 'Payment initialization failed'
        toast.error(msg)
        throw err
    }
}

