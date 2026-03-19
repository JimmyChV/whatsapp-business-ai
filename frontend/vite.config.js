import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-socket': ['socket.io-client'],
          'vendor-ui': ['lucide-react', 'emoji-picker-react', 'qrcode.react', 'simple-icons'],
          'vendor-utils': ['moment'],
        },
      },
    },
  },
})