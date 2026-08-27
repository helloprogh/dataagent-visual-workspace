const DATAAGENT_WEB_API_BASE = '/dataagent/web/api'

export const AGUI_URL = `${DATAAGENT_WEB_API_BASE}/agui`
export const AGUI_UPLOAD_URL = `${AGUI_URL}/upload`

function join(base: string, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export function dataAgentWebApi(path: string): string {
  return join(DATAAGENT_WEB_API_BASE, path)
}

export function managementApi(path: string): string {
  return join(DATAAGENT_WEB_API_BASE, path)
}
