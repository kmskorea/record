import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 등 서브경로 배포 시 BASE_PATH=/record/ 로 빌드
// 배포된 앱이 어느 시점 빌드인지 화면에서 확인할 수 있게 심어둔다.
// 홈 화면에 설치한 앱은 옛 버전이 남아 있기 쉬워서, 문제를 볼 때
// '고친 게 반영은 됐는지'부터 가려야 한다.
const BUILD_ID = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
  server: { host: true, port: 5173 },
})
