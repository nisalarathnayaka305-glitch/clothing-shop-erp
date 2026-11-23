import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const accountingRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: accountingRoot,
  base: '/clothing-shop-erp/accounting/',
  plugins: [react()],
  build: {
    outDir: '../dist/accounting',
    emptyOutDir: false,
  },
})
