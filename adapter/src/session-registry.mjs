import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultFile = fileURLToPath(new URL('../.data/thread-sessions.json', import.meta.url))

export class SessionRegistry {
  constructor(file = process.env.ADAPTER_STATE_FILE || defaultFile) {
    this.file = file
    this.sessions = new Map()
    this.ready = this.load()
  }

  async load() {
    try {
      const value = JSON.parse(await readFile(this.file, 'utf8'))
      for (const [threadId, record] of Object.entries(value)) {
        if (record?.sessionId) this.sessions.set(threadId, record)
      }
    } catch {
      // A missing or invalid cache starts as an empty mapping.
    }
  }

  async get(threadId) {
    await this.ready
    return this.sessions.get(threadId)
  }

  async set(threadId, sessionId) {
    await this.ready
    const record = { sessionId, updatedAt: Date.now() }
    this.sessions.set(threadId, record)
    await this.save()
    return record
  }

  async delete(threadId) {
    await this.ready
    this.sessions.delete(threadId)
    await this.save()
  }

  async list() {
    await this.ready
    return [...this.sessions.entries()].map(([threadId, record]) => ({ threadId, ...record }))
  }

  async save() {
    await mkdir(path.dirname(this.file), { recursive: true })
    await writeFile(this.file, `${JSON.stringify(Object.fromEntries(this.sessions), null, 2)}\n`, 'utf8')
  }
}
