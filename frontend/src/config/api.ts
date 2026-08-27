type ApiBaseName = 'VITE_DATAAGENT_WEB_API_BASE' | 'VITE_DATAAGENT_API_BASE' | 'VITE_MANAGEMENT_API_BASE'

function requiredBase(name: ApiBaseName, value: string | undefined): string {
  const base = value?.trim()
  if (!base) throw new Error(`${name} 未配置`)
  return base.replace(/\/+$/, '')
}

function join(base: string, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export function dataAgentWebApi(path: string): string {
  return join(requiredBase('VITE_DATAAGENT_WEB_API_BASE', import.meta.env.VITE_DATAAGENT_WEB_API_BASE), path)
}

export function dataAgentApi(path: string): string {
  return join(requiredBase('VITE_DATAAGENT_API_BASE', import.meta.env.VITE_DATAAGENT_API_BASE), path)
}

export function managementApi(path: string): string {
  return join(requiredBase('VITE_MANAGEMENT_API_BASE', import.meta.env.VITE_MANAGEMENT_API_BASE), path)
}
