import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 本番ビルドは 1 枚の HTML にまとめ、React は cdnjs の UMD 版（グローバル変数）を使う。
// scripts/build-artifact.mjs がこれを claude.ai アーティファクト用の形に整える。
export default defineConfig(({ command }) => ({
  plugins: [react({ jsxRuntime: 'classic' }), ...(command === 'build' ? [viteSingleFile()] : [])],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        format: 'iife',
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
