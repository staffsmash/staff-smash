import { defineConfig } from 'vite';

// GitHub Pages(프로젝트 페이지)에서 하위 경로로 서비스되므로 상대 경로로 빌드한다.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
