import { ref } from 'vue'

export type ModelSelection = {
  providerID: string
  modelID: string
}

export type ModelCatalogItem = ModelSelection & {
  name: string
  family?: string
  enabled?: boolean
  available?: boolean
}

const STORAGE_KEY = 'dataagent.model.selection.v1'

function readStoredSelection(): ModelSelection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    if (typeof value.providerID !== 'string' || typeof value.modelID !== 'string') return null
    if (!value.providerID.trim() || !value.modelID.trim()) return null
    return { providerID: value.providerID, modelID: value.modelID }
  } catch {
    return null
  }
}

export const selectedModel = ref<ModelSelection | null>(readStoredSelection())

export function setSelectedModel(value: ModelSelection | null) {
  selectedModel.value = value
  if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  else localStorage.removeItem(STORAGE_KEY)
}

function normalizeModel(value: unknown): ModelCatalogItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, any>
  const providerID = item.providerID ?? item.providerId ?? item.provider?.id ?? item.provider?.providerID
  const modelID = item.modelID ?? item.modelId ?? item.id
  if (typeof providerID !== 'string' || typeof modelID !== 'string') return null
  if (!providerID.trim() || !modelID.trim()) return null
  return {
    providerID,
    modelID,
    name: String(item.name ?? item.displayName ?? item.title ?? modelID),
    ...(typeof item.family === 'string' ? { family: item.family } : {}),
    ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
    ...(typeof item.available === 'boolean' ? { available: item.available } : {}),
  }
}

export async function listAvailableModels(): Promise<ModelCatalogItem[]> {
  const response = await fetch('/api/opencode/models', { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body?.error || `模型列表加载失败 (${response.status})`)
  }
  const body = await response.json()
  const source = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []
  return source
    .map(normalizeModel)
    .filter((item): item is ModelCatalogItem => Boolean(item))
    .filter(item => item.enabled !== false && item.available !== false)
    .sort((left, right) => left.providerID.localeCompare(right.providerID) || left.name.localeCompare(right.name))
}
