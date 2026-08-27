import { ref } from 'vue'
import { dataAgentWebApi } from '../config/api'

export type ModelSelection = {
  providerID: string
  id: string
}

export type ModelCatalogItem = ModelSelection & {
  name: string
  enabled?: boolean
  capabilities?: {
    tools?: boolean
    input?: string[]
  }
}

const STORAGE_KEY = 'dataagent.model.selection.v4.by-session'

function isSelection(value: unknown): value is ModelSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.providerID === 'string'
    && Boolean(item.providerID.trim())
    && typeof item.id === 'string'
    && Boolean(item.id.trim())
}

function readStoredSelections(): Record<string, ModelSelection> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

    return Object.fromEntries(
      Object.entries(value)
        .filter(([, model]) => isSelection(model))
        .map(([sessionId, model]) => [sessionId, {
          providerID: (model as ModelSelection).providerID,
          id: (model as ModelSelection).id,
        }]),
    )
  } catch {
    return {}
  }
}

export const selectedModels = ref<Record<string, ModelSelection>>(readStoredSelections())

export function getSelectedModel(sessionId: string): ModelSelection | null {
  const id = sessionId.trim()
  if (!id) return null
  return selectedModels.value[id] ?? null
}

export function setSelectedModel(sessionId: string, model: ModelSelection | null) {
  const id = sessionId.trim()
  if (!id) return

  const next = { ...selectedModels.value }
  if (model) next[id] = { providerID: model.providerID, id: model.id }
  else delete next[id]

  selectedModels.value = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

function normalizeModel(value: unknown): ModelCatalogItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, any>
  const rawProviderID = item.providerID ?? item.providerId ?? item.provider?.id ?? item.provider?.providerID
  const providerID = typeof rawProviderID === 'string' && rawProviderID.trim()
    ? rawProviderID.trim()
    : 'local'
  const id = item.id ?? item.modelID ?? item.modelId
  if (typeof id !== 'string' || !id.trim()) return null

  const capabilities = item.capabilities && typeof item.capabilities === 'object'
    ? {
        ...(typeof item.capabilities.tools === 'boolean' ? { tools: item.capabilities.tools } : {}),
        ...(Array.isArray(item.capabilities.input)
          ? { input: item.capabilities.input.filter((entry: unknown): entry is string => typeof entry === 'string') }
          : {}),
      }
    : undefined

  return {
    providerID,
    id: id.trim(),
    name: String(item.name ?? item.displayName ?? item.title ?? id),
    ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
    ...(capabilities ? { capabilities } : {}),
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

function unwrapModelData(body: any): unknown {
  if (body?.data?.data != null) return body.data.data
  if (body?.data != null) return body.data
  return body
}

export async function listAvailableModels(): Promise<ModelCatalogItem[]> {
  const body = await requestJson(dataAgentWebApi('/model'), { method: 'GET' }, '模型列表加载失败')
  const root = unwrapModelData(body)
  const source: unknown[] = Array.isArray(root)
    ? root
    : Array.isArray((root as any)?.models)
      ? (root as any).models
      : []

  return source
    .map(normalizeModel)
    .filter((item): item is ModelCatalogItem => Boolean(item))
    .filter(item => item.enabled !== false)
    .sort((left, right) => left.providerID.localeCompare(right.providerID) || left.name.localeCompare(right.name))
}

export async function getDefaultModel(): Promise<ModelCatalogItem | null> {
  const body = await requestJson(dataAgentWebApi('/model/default'), { method: 'GET' }, '默认模型加载失败')
  const root = unwrapModelData(body)
  return normalizeModel((root as any)?.model ?? root)
}

async function applyModel(sessionId: string, model: ModelSelection) {
  const id = sessionId.trim()
  if (!id) throw new Error('模型切换失败：sessionId 为空')
  await requestJson(dataAgentWebApi(`/session/${encodeURIComponent(id)}/model`), {
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
  setSelectedModel(sessionId, model)
}
