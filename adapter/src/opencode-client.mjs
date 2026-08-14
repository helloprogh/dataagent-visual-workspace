import { parseSse } from './sse.mjs'

const jsonHeaders = { 'Content-Type': 'application/json' }

export class OpenCodeClient {
  constructor(baseUrl = 'http://127.0.0.1:4096', fetchImpl = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetch = fetchImpl
  }

  async createSession(title = 'AG-UI session') {
    const response = await this.fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ title }),
    })
    if (!response.ok) throw new Error(`Unable to create OpenCode session (${response.status})`)
    return response.json()
  }

  async promptAsync(sessionId, parts) {
    const response = await this.fetch(`${this.baseUrl}/session/${encodeURIComponent(sessionId)}/prompt_async`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ parts }),
    })
    if (!response.ok) throw new Error(`OpenCode prompt_async failed (${response.status})`)
  }

  async *events(signal) {
    const response = await this.fetch(`${this.baseUrl}/global/event`, {
      headers: { Accept: 'text/event-stream' },
      signal,
    })
    yield* parseSse(response)
  }

  async proxy(path, init) {
    return this.fetch(`${this.baseUrl}${path}`, init)
  }
}

