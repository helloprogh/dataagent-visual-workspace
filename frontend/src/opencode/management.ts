export interface AgentSkill {
  name: string
  description?: string
  id?: string
  [key: string]: unknown
}

export interface OpenCodeDiagnostics {
  connected: boolean
  url?: string
  version?: string
  pid?: number
  error?: string
}

export interface OpenCodeWorkspace {
  id?: string
  workspaceID?: string
  projectID?: string
  name?: string
  directory?: string
  path?: string
  worktree?: string
  type?: string
  archived?: boolean
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface OpenCodeProject {
  id?: string
  projectID?: string
  name?: string
  worktree?: string
  directory?: string
  [key: string]: unknown
}

export interface CreateOpenCodeWorkspaceInput {
  projectID?: string
  name?: string
  directory?: string
  type: string
  metadata?: Record<string, unknown>
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string } & Record<string, unknown>
  if (!response.ok) {
    const message = typeof body.error === 'string'
      ? body.error
      : typeof body.message === 'string'
        ? body.message
        : `Request failed (${response.status})`
    throw new Error(message)
  }
  return body as T
}

function normalizeSkillList(value: unknown): AgentSkill[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : value && typeof value === 'object' && Array.isArray((value as { skills?: unknown }).skills)
        ? (value as { skills: unknown[] }).skills
        : []

  return source
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      ...item,
      name: String(item.name ?? item.skillName ?? item.id ?? ''),
      description: item.description == null ? undefined : String(item.description),
      id: item.id == null ? undefined : String(item.id),
    }))
    .filter(item => item.name)
}

export async function listAgentSkills(): Promise<AgentSkill[]> {
  return normalizeSkillList(await requestJson<unknown>('/opencode/api/skill'))
}

export async function uploadAgentSkill(file: File): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  await requestJson('/opencode/api/skill/upload', {
    method: 'POST',
    body: form,
  })
}

export async function deleteAgentSkill(skillName: string): Promise<void> {
  await requestJson(`/opencode/api/skill/upload/delete/${encodeURIComponent(skillName)}`, {
    method: 'DELETE',
  })
}

export async function getOpenCodeDiagnostics(): Promise<OpenCodeDiagnostics> {
  return requestJson<OpenCodeDiagnostics>('/api/opencode/health')
}

export async function listOpenCodeProjects(): Promise<OpenCodeProject[]> {
  const response = await requestJson<{ data?: OpenCodeProject[] }>('/api/opencode/projects')
  return Array.isArray(response.data) ? response.data : []
}

export async function listOpenCodeWorkspaces(projectID?: string): Promise<OpenCodeWorkspace[]> {
  const query = projectID ? `?projectID=${encodeURIComponent(projectID)}` : ''
  const response = await requestJson<{ data?: OpenCodeWorkspace[] }>(`/api/opencode/workspaces${query}`)
  return Array.isArray(response.data) ? response.data : []
}

export async function createOpenCodeWorkspace(input: CreateOpenCodeWorkspaceInput): Promise<OpenCodeWorkspace> {
  const response = await requestJson<{ data: OpenCodeWorkspace }>('/api/opencode/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return response.data
}

export async function updateOpenCodeWorkspace(workspaceID: string, input: Partial<CreateOpenCodeWorkspaceInput> & { archived?: boolean }): Promise<OpenCodeWorkspace> {
  const response = await requestJson<{ data: OpenCodeWorkspace }>(`/api/opencode/workspaces/${encodeURIComponent(workspaceID)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return response.data
}

export async function deleteOpenCodeWorkspace(workspaceID: string): Promise<void> {
  await requestJson(`/api/opencode/workspaces/${encodeURIComponent(workspaceID)}`, { method: 'DELETE' })
}

export function workspaceId(workspace: OpenCodeWorkspace): string {
  return String(workspace.id ?? workspace.workspaceID ?? '')
}

export function workspaceDirectory(workspace: OpenCodeWorkspace): string {
  return String(workspace.directory ?? workspace.path ?? workspace.worktree ?? '')
}

export function projectId(project: OpenCodeProject): string {
  return String(project.id ?? project.projectID ?? '')
}
