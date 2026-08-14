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
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(input)) if (value != null) query.set(key, String(value))
    const suffix = query.size ? `?${query}` : ''
    return this.json(`/api/session${suffix}`, {}, 'Unable to list OpenCode sessions')
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

  async listMcp() {
    return this.json('/api/mcp', {}, 'Unable to list OpenCode MCP servers')
  }

  async context(sessionId) {
    return this.json(`/api/session/${encodeURIComponent(sessionId)}/context`, {}, 'Unable to read OpenCode context')
  }

  async inbox(sessionId) {
    return this.json(`/api/session/${encodeURIComponent(sessionId)}/inbox`, {}, 'Unable to read OpenCode inbox')
  }

  async permissions(sessionId) {
    return this.json(`/api/session/${encodeURIComponent(sessionId)}/permission`, {}, 'Unable to read OpenCode permissions')
  }

  async replyPermission(sessionId, requestId, reply, message) {
    return this.json(`/api/session/${encodeURIComponent(sessionId)}/permission/${encodeURIComponent(requestId)}/reply`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ reply, message }),
    }, 'Unable to reply to OpenCode permission')
  }

  async background(sessionId) {
    return this.json(`/api/session/${encodeURIComponent(sessionId)}/background`, { method: 'POST' }, 'Unable to background OpenCode tools')
  }

  async interrupt(sessionId) {
    return this.json(`/api/session/${encodeURIComponent(sessionId)}/interrupt`, { method: 'POST' }, 'Unable to interrupt OpenCode session')
  }

  async *events(signal) {
    const response = await this.request('/api/event', {
      headers: { Accept: 'text/event-stream' },
      signal,
    })
    if (!response.ok) throw new Error(await errorMessage(response, 'Unable to subscribe to OpenCode events'))
    yield* parseSse(response)
  }

  async proxy(pathname, init) {
    const target = pathname.startsWith('/api/') ? pathname : `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`
    return this.request(target, init)
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
