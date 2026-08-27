import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

function localPath(value: string | undefined): string | undefined {
  const path = value?.trim().replace(/\/+$/, '')
  return path?.startsWith('/') ? path : undefined
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_AGUI_PROXY_TARGET || 'http://localhost:3001'
  const uploadProxyTarget = env.VITE_AGUI_UPLOAD_PROXY_TARGET || proxyTarget
  const proxy: Record<string, any> = {}

  const addProxy = (path: string | undefined, target = proxyTarget, rewrite?: () => string) => {
    if (!path) return
    proxy[path] = {
      target,
      changeOrigin: true,
      ...(rewrite ? { rewrite } : {}),
    }
  }

  addProxy(localPath(env.VITE_AGUI_UPLOAD_URL), uploadProxyTarget)
  addProxy(localPath(env.VITE_AGUI_URL), proxyTarget, () => '/agent')
  addProxy(localPath(env.VITE_DATAAGENT_WEB_API_BASE))
  addProxy(localPath(env.VITE_DATAAGENT_API_BASE))

  const managementBase = localPath(env.VITE_MANAGEMENT_API_BASE)
  if (managementBase) {
    for (const resource of ['skill', 'health', 'projects', 'workspaces']) {
      addProxy(`${managementBase}/${resource}`)
    }
  }

  return {
    plugins: [vue()],
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy,
    },
  }
})
