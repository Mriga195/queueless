import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, proxy to the live API so CORS doesn't need FRONTEND_URL=localhost
const API = 'https://queueless-bywb.onrender.com'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/img': { target: API, changeOrigin: true },
    },
  },
})