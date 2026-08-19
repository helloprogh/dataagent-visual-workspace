export interface OpenCodeDiagnostics {
  connected: boolean
  url?: string
  version?: string
  pid?: number
  error?: string
}

export interface OpenCodeSkill {
  id: string
  name?: string
  description?: string
  slash?: boolean
  autoinvoke?: boolean
  location?: string
  content?: string
  [key: string]: unknown
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

export type SkillInstallScope = 'global' | 'workspace'

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({})) as { error?: string } & Record<string, unknown>
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `Request failed (${response.status})`)
  return body as T
}

export async function getOpenCodeDiagnostics(): Promise<OpenCodeDiagnostics> {
  return requestJson<OpenCodeDiagnostics>('/api/opencode/health')
}

export async function listOpenCodeSkills(input: { directory?: string; workspaceID?: string } = {}): Promise<OpenCodeSkill[]> {
  const query = new URLSearchParams()
  if (input.directory) query.set('directory', input.directory)
  if (input.workspaceID) query.set('workspaceID', input.workspaceID)
  const suffix = query.size ? `?${query.toString()}` : ''
  const response = await requestJson<{ data?: OpenCodeSkill[] }>(`/api/opencode/skills${suffix}`)
  return Array.isArray(response.data) ? response.data : []
}

export async function installOpenCodeSkillPackage(
  file: File,
  input: { scope: SkillInstallScope; workspaceID?: string; replace?: boolean },
): Promise<{ id: string; scope: SkillInstallScope; workspaceID?: string; directory: string }> {
  const query = new URLSearchParams({ scope: input.scope })
  if (input.workspaceID) query.set('workspaceID', input.workspaceID)
  if (input.replace) query.set('replace', 'true')
  const response = await requestJson<{ data: { id: string; scope: SkillInstallScope; workspaceID?: string; directory: string } }>(
    `/api/opencode/skills/install?${query.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        'x-skill-package-name': file.name,
      },
      body: file,
    },
  )
  return response.data
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
