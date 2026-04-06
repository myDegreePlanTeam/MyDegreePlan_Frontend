import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // rolldown (Vite 8's bundler) only supports manualChunks as a
        // function — the object shorthand from classic Rollup isn't
        // implemented yet. The function receives each module's resolved
        // file path and returns the chunk name it should land in.
        // Vite normalises all paths to forward slashes on every OS.
        manualChunks(id) {
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router')
          ) {
            return 'vendor'
          }
          if (id.includes('/node_modules/@supabase/')) {
            return 'supabase'
          }
        },
      },
    },
  },
})
