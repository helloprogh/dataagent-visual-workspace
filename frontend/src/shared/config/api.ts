const DATAAGENT_WEB_API_BASE = '/dataagent/web/api'

export const AGUI_URL = `${DATAAGENT_WEB_API_BASE}/agui`
export const AGUI_UPLOAD_URL = `${AGUI_URL}/file/upload`

export const AGENT_ID = import.meta.env.VITE_AGENT_ID || 'data-agent'
export const AGENT_DISPLAY_NAME = import.meta.env.VITE_AGENT_DISPLAY_NAME || 'Data Agent'

export function dataAgentWebApi(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${DATAAGENT_WEB_API_BASE}${suffix}`
}
