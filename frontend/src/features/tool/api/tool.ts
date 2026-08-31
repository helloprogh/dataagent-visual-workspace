import { dataAgentWebApi } from '../../../shared/config/api'
import { requestJson, unwrapData } from '../../../shared/api/http'
import { getDefaultModel, getSelectedModel } from '../../model/api/model'

export type CapabilityItem = {
  id: string
  name: string
  description: string
  category: string
  kind: 'tool' | 'mcp-server'
  status: 'ready' | 'registered' | 'attention' | 'disabled' | 'error'
  statusLabel: string
  source: string
  capabilities: string[]
}

export type CapabilityCatalog = {
  items: CapabilityItem[]
  warnings: string[]
}

export async function loadCapabilityCatalog(sessionId?: string): Promise<CapabilityCatalog> {
  let selected = sessionId ? getSelectedModel(sessionId) : null
  if (!selected) selected = await getDefaultModel().catch(() => null)
  const query = new URLSearchParams()
  if (selected) {
    query.set('providerID', selected.providerID)
    query.set('modelID', selected.id)
  }
  const body = await requestJson<any>(
    `${dataAgentWebApi('/tools')}${query.size ? `?${query.toString()}` : ''}`,
    {},
    '能力目录加载失败',
  )
  const catalog = unwrapData<any>(body) ?? {}
  return {
    items: Array.isArray(catalog.items) ? catalog.items : [],
    warnings: Array.isArray(catalog.warnings) ? catalog.warnings.map(String) : [],
  }
}
