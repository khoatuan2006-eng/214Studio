import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  // 18.4: Optimized build chunking for faster initial load
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('zustand') || id.includes('zundo')) {
              return 'vendor-react';
            }
            if (id.includes('konva')) {
              return 'vendor-konva';
            }
            if (id.includes('@xzdarcy/react-timeline-editor')) {
              return 'vendor-timeline';
            }
            if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge')) {
              return 'vendor-ui';
            }
          }
        },
      },
    },
  },
  // 18.2: Enable Web Worker bundling
  worker: {
    format: 'es',
  },
})
