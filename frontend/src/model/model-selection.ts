import { ref } from 'vue'

export type ModelSelection = {
  providerID: string
  id: string
}

export type ModelCatalogItem = ModelSelection & {
  name: string
  family?: string
  enabled?: boolean
  available?: boolean
}

const STORAGE_KEY = 'dataagent.model.selection.v3'
const MODEL_LIST_URL = '/dataagent/opencode/api/model'
const DEFAULT_MODEL_URL = '/dataagent/opencode/api/model/default'

function isSelection(value: unknown): value is ModelSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.providerID === 'string'
    && Boolean(item.providerID.trim())
    && typeof item.id === 'string'
    && Boolean(item.id.trim())
}

function readStoredSelection(): ModelSelection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    return isSelection(value) ? { providerID: value.providerID, id: value.id } : null
  } catch {
    return null
  }
}

export const selectedModel = ref<ModelSelection | null>(readStoredSelection())

export function setSelectedModel(model: ModelSelection | null) {
  selectedModel.value = model
  if (model) localStorage.setItem(STORAGE_KEY, JSON.stringify(model))
  else localStorage.removeItem(STORAGE_KEY)
}

function normalizeModel(value: unknown): ModelCatalogItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, any>
  const providerID = item.providerID ?? item.providerId ?? item.provider?.id ?? item.provider?.providerID
  const id = item.id ?? item.modelID ?? item.modelId
  if (typeof providerID !== 'string' || typeof id !== 'string') return null
  if (!providerID.trim() || !id.trim()) return null
  return {
    providerID,
    id,
    name: String(item.name ?? item.displayName ?? item.title ?? id),
    ...(typeof item.family === 'string' ? { family: item.family } : {}),
    ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
    ...(typeof item.available === 'boolean' ? { available: item.available } : {}),
  }
}

async function requestJson(url: string, init: RequestInit = {}, action: string) {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.message ?? body?.error?.message ?? body?.error ?? ''
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(`${action} (${response.status})${detail ? `: ${detail}` : ''}`)
  }
  if (response.status === 204) return undefined
  return response.json()
}

export async function listAvailableModels(): Promise<ModelCatalogItem[]> {
  const body = await requestJson(MODEL_LIST_URL, { method: 'GET' }, '模型列表加载失败')
  const root = body?.data ?? body
  const source: unknown[] = Array.isArray(root)
    ? root
    : Array.isArray(root?.models)
      ? root.models
      : []
  return source
    .map(normalizeModel)
    .filter((item): item is ModelCatalogItem => Boolean(item))
    .filter(item => item.enabled !== false && item.available !== false)
    .sort((left, right) => left.providerID.localeCompare(right.providerID) || left.name.localeCompare(right.name))
}

export async function getDefaultModel(): Promise<ModelCatalogItem | null> {
  const body = await requestJson(DEFAULT_MODEL_URL, { method: 'GET' }, '默认模型加载失败')
  const root = body?.data ?? body
  return normalizeModel(root?.model ?? root)
}

async function applyModel(sessionId: string, model: ModelSelection) {
  const id = sessionId.trim()
  if (!id) throw new Error('模型切换失败：sessionId 为空')
  await requestJson(`/dataagent/opencode/api/session/${encodeURIComponent(id)}/model`, {
    method: 'POST',
    body: JSON.stringify({
      model: {
        providerID: model.providerID,
        id: model.id,
      },
    }),
  }, '模型切换失败')
}

export async function selectModel(sessionId: string, model: ModelSelection) {
  await applyModel(sessionId, model)
  setSelectedModel(model)
}

export async function syncSelectedModel(sessionId: string) {
  if (!selectedModel.value) return
  await applyModel(sessionId, selectedModel.value)
}
