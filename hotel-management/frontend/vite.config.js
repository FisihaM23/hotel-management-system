import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '::', // Dual-stack IPv6 (::1) and IPv4 (127.0.0.1) for Windows Firefox & Chrome
    port: 5173,
    strictPort: false,
    cors: true, // Allow cross-origin requests from browser extensions and mobile testing tools
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Private-Network': 'true'
      // Omit all X-Frame-Options and Content-Security-Policy framing headers
      // so Firefox, Chrome, Edge, and Safari allow framing unconditionally without CSP parsing conflicts
    }
  },
  preview: {
    host: '::',
    port: 5173,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Private-Network': 'true'
    }
  }
})
