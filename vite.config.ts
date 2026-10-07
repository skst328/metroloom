import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// バージョンは package.json の version だけで管理し、ビルド時にアプリへ埋め込む
const { version } = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as {
  version: string
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages ではリポジトリ名のパスの下に置かれる。開発サーバーは / のままにする
  base: mode === 'production' ? '/metroloom/' : '/',
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
}))
