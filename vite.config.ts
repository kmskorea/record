import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 등 서브경로 배포 시 BASE_PATH=/record/ 로 빌드
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
  server: { host: true, port: 5173 },
})
