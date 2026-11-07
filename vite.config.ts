import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // 生产产物使用相对路径，便于直接静态托管 / Tauri 打包；dev 仍用根路径以适配 HMR。
  base: command === 'build' ? './' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'chrome105',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        // 只把完全独立、不依赖 React 的 elkjs 单独拆出（拓扑页按需加载）。
        // 其余依赖由 Rollup 自动组织：把 React / @react-three / Radix / echarts 等
        // 拆成多个 vendor-like chunk 会形成 chunk 间循环依赖，先执行的一侧拿到
        // 未初始化的 React 命名空间，报 "Cannot read properties of undefined
        // (reading 'useLayoutEffect')" 并导致整页黑屏。页面级 React.lazy 拆分保留。
        manualChunks(id: string) {
          if (id.includes('node_modules') && /elkjs/i.test(id)) return 'elk'
          return undefined
        },
      },
    },
  },
}))
