import { ref } from 'vue'
import { dataAgentWebApi } from '../../../shared/config/api'
import { requestJson, unwrapData } from '../../../shared/api/http'
import type { ModelCatalogItem, ModelSelection } from '../types'

const STORAGE_KEY = 'dataagent.model.selection.v5.by-session'

function isSelection(value: unknown): value is ModelSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.providerID === 'string' && Boolean(item.providerID.trim())
    && typeof item.id === 'string' && Boolean(item.id.trim())
}

function readStored(): Record<string, ModelSelection> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, item]) => isSelection(item))) as Record<string, ModelSelection>
  } catch { return {} }
}

export const selectedModels = ref<Record<string, ModelSelection>>(readStored())

export function getSelectedModel(sessionId: string): ModelSelection | null {
  return selectedModels.value[sessionId.trim()] ?? null
}

export function rememberSelectedModel(sessionId: string, model: ModelSelection) {
  const id = sessionId.trim()
  if (!id) return
  selectedModels.value = { ...selectedModels.value, [id]: model }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedModels.value))
}

function normalizeModel(value: unknown): ModelCatalogItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, any>
  const providerID = String(item.providerID ?? item.providerId ?? item.provider?.id ?? 'local').trim()
  const id = item.id ?? item.modelID ?? item.modelId
  if (typeof id !== 'string' || !id.trim()) return null
  return {
    providerID,
    id: id.trim(),
    name: String(item.name ?? item.displayName ?? item.title ?? id),
    ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
    ...(item.capabilities && typeof item.capabilities === 'object' ? {
      capabilities: {
        ...(typeof item.capabilities.tools === 'boolean' ? { tools: item.capabilities.tools } : {}),
        ...(Array.isArray(item.capabilities.input) ? { input: item.capabilities.input.filter((v: unknown) => typeof v === 'string') } : {}),
      },
    } : {}),
  }
}

export async function listModels(): Promise<ModelCatalogItem[]> {
  const body = await requestJson<any>(dataAgentWebApi('/model'), {}, '模型列表加载失败')
  const root = unwrapData<any>(body)
  const source = Array.isArray(root) ? root : Array.isArray(root?.models) ? root.models : []
  return source.map(normalizeModel).filter((item): item is ModelCatalogItem => Boolean(item && item.enabled !== false))
}

export async function getDefaultModel(): Promise<ModelCatalogItem | null> {
  const body = await requestJson<any>(dataAgentWebApi('/model/default'), {}, '默认模型加载失败')
  const root = unwrapData<any>(body)
  return normalizeModel(root?.model ?? root)
}

export async function switchSessionModel(sessionId: string, model: ModelSelection) {
  const id = sessionId.trim()
  if (!id) throw new Error('sessionId 不能为空')
  await requestJson(dataAgentWebApi(`/session/${encodeURIComponent(id)}/model`), {
    method: 'POST',
    body: JSON.stringify({ model: { providerID: model.providerID, id: model.id } }),
  }, '模型切换失败')
  rememberSelectedModel(id, model)
}
