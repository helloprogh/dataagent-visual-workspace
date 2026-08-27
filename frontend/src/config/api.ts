const DATAAGENT_WEB_API_BASE = '/dataagent/web/api'
const DATAAGENT_API_BASE = '/dataagent/api'
const MANAGEMENT_API_BASE = '/api'

function join(base: string, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export function dataAgentWebApi(path: string): string {
  return join(DATAAGENT_WEB_API_BASE, path)
}

export function dataAgentApi(path: string): string {
  return join(DATAAGENT_API_BASE, path)
}

export function managementApi(path: string): string {
  return join(MANAGEMENT_API_BASE, path)
}
