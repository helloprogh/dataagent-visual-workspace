import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_AGUI_PROXY_TARGET || 'http://localhost:3001'
  const aguiEndpoint = env.VITE_AGUI_ENDPOINT || '/agent'

  return {
    plugins: [vue()],
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/api/agui': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: () => aguiEndpoint,
        },
        '/api/adapter': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api\/adapter/, '/debug'),
        },
      },
    },
  }
})
