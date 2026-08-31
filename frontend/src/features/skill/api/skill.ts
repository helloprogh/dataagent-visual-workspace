import { dataAgentWebApi } from '../../../shared/config/api'
import { requestJson } from '../../../shared/api/http'

export type AgentSkill = {
  name: string
  description?: string
  id?: string
  [key: string]: unknown
}

function normalizeSkills(value: unknown): AgentSkill[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as any).data)
      ? (value as any).data
      : value && typeof value === 'object' && Array.isArray((value as any).skills)
        ? (value as any).skills
        : []
  return source
    .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      ...item,
      name: String(item.name ?? item.skillName ?? item.id ?? ''),
      description: item.description == null ? undefined : String(item.description),
      id: item.id == null ? undefined : String(item.id),
    }))
    .filter(item => item.name)
}

export async function listSkills(): Promise<AgentSkill[]> {
  return normalizeSkills(await requestJson(dataAgentWebApi('/skill'), {}, '技能列表加载失败'))
}

export async function uploadSkill(file: File): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  await requestJson(dataAgentWebApi('/skill/upload'), { method: 'POST', body: form }, '技能上传失败')
}

export async function deleteSkill(name: string): Promise<void> {
  await requestJson(dataAgentWebApi(`/skill/upload/delete/${encodeURIComponent(name)}`), { method: 'DELETE' }, '技能删除失败')
}
