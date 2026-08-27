import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_AGUI_PROXY_TARGET || 'http://localhost:3001'
  const uploadProxyTarget = env.VITE_AGUI_UPLOAD_PROXY_TARGET || proxyTarget

  return {
    plugins: [vue()],
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/api/agui/upload': {
          target: uploadProxyTarget,
          changeOrigin: true,
        },
        '/api/agui': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: () => '/agent',
        },
        '/dataagent/web/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/dataagent/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/api/skill': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/api/health': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/api/projects': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/api/workspaces': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
