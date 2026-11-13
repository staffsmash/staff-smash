import { defineConfig } from 'vite';

// GitHub Pages(프로젝트 페이지)에서 하위 경로로 서비스되므로 상대 경로로 빌드한다.
// 페이지 두 개: 본편(index.html, 2D)과 1인칭 시험판(fps.html, Three.js).
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      input: {
        main: 'index.html',
        fps: 'fps.html',
      },
    },
  },
});
