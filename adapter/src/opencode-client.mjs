import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { parseSse } from './sse.mjs'

const jsonHeaders = { 'Content-Type': 'application/json' }
const trimUrl = (value) => value?.replace(/\/$/, '')

const serviceFiles = () => {
  const userHome = homedir()
  const stateRoot = process.env.XDG_STATE_HOME || path.join(userHome, '.local', 'state')
  const configRoot = process.env.XDG_CONFIG_HOME || path.join(userHome, '.config')
  return {
    registration: process.env.OPENCODE_SERVICE_FILE || path.join(stateRoot, 'opencode', 'service.json'),
    config: path.join(configRoot, 'opencode', 'service.json'),
  }
}

const readJson = async (file) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return undefined
  }
}

const errorMessage = async (response, action) => {
  let detail = ''
  try {
    const body = await response.json()
    detail = body?.message ?? body?.error?.message ?? body?.error ?? ''
  } catch {
    // The status code is enough when the upstream did not return JSON.
  }
  return `${action} (${response.status})${detail ? `: ${detail}` : ''}`
}

const querySuffix = (input = {}, aliases = {}) => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value == null || value === '') continue
    query.set(aliases[key] ?? key, String(value))
  }
  return query.size ? `?${query}` : ''
}

export class OpenCodeClient {
  constructor(options = {}) {
    if (typeof options === 'string') options = { baseUrl: options }
    this.explicitBaseUrl = trimUrl(options.baseUrl || process.env.OPENCODE_BASE_URL)
    this.username = options.username || process.env.OPENCODE_USERNAME || 'opencode'
    this.explicitPassword = options.password || process.env.OPENCODE_PASSWORD
    this.fetch = options.fetchImpl || fetch
  }

  async endpoint() {
    const files = serviceFiles()
    const registration = await readJson(files.registration)
    const config = await readJson(files.config)
    const baseUrl = this.explicitBaseUrl || trimUrl(registration?.url)
    if (!baseUrl) {
      throw new Error(`OpenCode service was not found. Start "opencode2 serve --service" or set OPENCODE_BASE_URL.`)
    }
    return {
      baseUrl,
      username: this.username,
      password: this.explicitPassword || registration?.password || config?.password,
      version: registration?.version,
      pid: registration?.pid,
      serviceFile: files.registration,
    }
  }

  async request(pathname, init = {}) {
    const endpoint = await this.endpoint()
    const headers = new Headers(init.headers)
    headers.delete('host')
    if (endpoint.password && !headers.has('Authorization')) {
      headers.set('Authorization', `Basic ${Buffer.from(`${endpoint.username}:${endpoint.password}`).toString('base64')}`)
    }
    return this.fetch(`${endpoint.baseUrl}${pathname}`, { ...init, headers })
  }

  async json(pathname, init, action) {
    const response = await this.request(pathname, init)
    if (!response.ok) throw new Error(await errorMessage(response, action))
    if (response.status === 204) return undefined
    const body = await response.json()
    return body?.data ?? body
  }

  async health() {
    return this.json('/api/health', { headers: { Accept: 'application/json' } }, 'OpenCode health check failed')
  }

  async createSession(title = 'AG-UI session') {
    return this.json('/api/session', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ title }),
    }, 'Unable to create OpenCode session')
  }

  async getSession(sessionId) {
    return this.json(`/api/session/${encodeURIComponent(sessionId)}`, {}, 'Unable to read OpenCode session')
  }

  async listSessions(input = {}) {
    return this.json(`/api/session${querySuffix(input)}`, {}, 'Unable to list OpenCode sessions')
  }

  async listSkills(input = {}) {
    const suffix = querySuffix(input, { workspaceID: 'workspace' })
    return this.json(`/api/skill${suffix}`, {}, 'Unable to list OpenCode skills')
  }

  async listProjects() {
    return this.json('/api/project', {}, 'Unable to list OpenCode projects')
  }

  async listWorkspaces(input = {}) {
    return this.json(`/api/workspace${querySuffix(input)}`, {}, 'Unable to list OpenCode workspaces')
  }

  async getWorkspace(workspaceId) {
    return this.json(`/api/workspace/${encodeURIComponent(workspaceId)}`, {}, 'Unable to read OpenCode workspace')
  }

  async createWorkspace(input) {
    return this.json('/api/workspace', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(input),
    }, 'Unable to create OpenCode workspace')
  }

  async updateWorkspace(workspaceId, input) {
    return this.json(`/api/workspace/${encodeURIComponent(workspaceId)}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(input),
    }, 'Unable to update OpenCode workspace')
  }

  async deleteWorkspace(workspaceId) {
    return this.json(`/api/workspace/${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE',
    }, 'Unable to delete OpenCode workspace')
  }

  async prompt(sessionId, text, metadata = {}) {
    return this.json(`/api/session/${encodeURIComponent(sessionId)}/prompt`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ text, metadata }),
    }, 'OpenCode prompt failed')
  }

  async addMcp(server, url) {
    return this.json(`/api/mcp/${encodeURIComponent(server)}`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        config: {
          type: 'remote',
          url,
          oauth: false,
          codemode: false,
          timeout: { startup: 30000, catalog: 30000, execution: 600000 },
        },
      }),
    }, 'Unable to register AG-UI frontend MCP server')
  }

  async connectMcp(server) {
    return this.json(`/api/mcp/${encodeURIComponent(server)}/connect`, {
      method: 'POST',
    }, 'Unable to connect AG-UI frontend MCP server')
  }

  async disconnectMcp(server) {
    return this.json(`/api/mcp/${encodeURIComponent(server)}/disconnect`, {
      method: 'POST',
    }, 'Unable to disconnect AG-UI frontend MCP server')
  }

  async listMcp() {
    return this.json('/api/mcp', {}, 'Unable to list OpenCode MCP servers')
  }

  async replyPermission(sessionId, requestId, reply, message) {
    return this.json(`/api/session/${encodeURIComponent(sessionId)}/permission/${encodeURIComponent(requestId)}/reply`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ reply, message }),
    }, 'Unable to reply to OpenCode permission')
  }

  async *events(signal) {
    const response = await this.request('/api/event', {
      headers: { Accept: 'text/event-stream' },
      signal,
    })
    if (!response.ok) throw new Error(await errorMessage(response, 'Unable to subscribe to OpenCode events'))
    yield* parseSse(response)
  }

  async diagnostics() {
    const endpoint = await this.endpoint()
    try {
      const health = await this.health()
      return {
        connected: true,
        url: endpoint.baseUrl,
        version: health?.version ?? endpoint.version,
        pid: health?.pid ?? endpoint.pid,
      }
    } catch (error) {
      return {
        connected: false,
        url: endpoint.baseUrl,
        version: endpoint.version,
        pid: endpoint.pid,
        error: error.message,
      }
    }
  }
}
