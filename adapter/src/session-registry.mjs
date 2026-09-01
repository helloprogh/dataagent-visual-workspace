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
    let record = this.sessions.get(threadId)
    // New conversations are created by the frontend OpenCode create API and
    // their returned sessionId is used directly as the AG-UI threadId.
    // Keep an identity record only for adapter-local interrupt/resume state.
    if (!record && typeof threadId === 'string' && threadId) {
      record = { sessionId: threadId, updatedAt: Date.now() }
      this.sessions.set(threadId, record)
    }
    return record
  }

  async set(threadId, sessionId) {
    await this.ready
    const record = { sessionId, updatedAt: Date.now() }
    this.sessions.set(threadId, record)
    await this.save()
    return record
  }

  async pendingInterrupts(threadId) {
    const record = await this.get(threadId)
    return Array.isArray(record?.pendingInterrupts) ? record.pendingInterrupts : []
  }

  async setPendingInterrupts(threadId, interrupts) {
    await this.ready
    const record = this.sessions.get(threadId)
    if (!record) throw new Error('Thread is not mapped to an OpenCode session')
    record.pendingInterrupts = interrupts
    delete record.lastResume
    record.updatedAt = Date.now()
    await this.save()
  }

  async resolveInterrupts(threadId, receipt) {
    await this.ready
    const record = this.sessions.get(threadId)
    if (!record) throw new Error('Thread is not mapped to an OpenCode session')
    delete record.pendingInterrupts
    record.lastResume = receipt
    record.updatedAt = Date.now()
    await this.save()
  }

  async lastResume(threadId) {
    const record = await this.get(threadId)
    return record?.lastResume
  }

  async setUserMessage(threadId, runId, message) {
    await this.ready
    const record = await this.get(threadId)
    const messages = record.userMessages && typeof record.userMessages === 'object'
      ? record.userMessages
      : {}
    messages[runId] = { ...message, updatedAt: Date.now() }
    const recent = Object.entries(messages)
      .sort(([, left], [, right]) => Number(right?.updatedAt ?? 0) - Number(left?.updatedAt ?? 0))
      .slice(0, 200)
    record.userMessages = Object.fromEntries(recent)
    record.updatedAt = Date.now()
    await this.save()
  }

  async userMessages(threadId) {
    const record = await this.get(threadId)
    return record?.userMessages && typeof record.userMessages === 'object'
      ? record.userMessages
      : {}
  }

  async delete(threadId) {
    await this.ready
    this.sessions.delete(threadId)
    await this.save()
  }

  async save() {
    await mkdir(path.dirname(this.file), { recursive: true })
    await writeFile(this.file, `${JSON.stringify(Object.fromEntries(this.sessions), null, 2)}\n`, 'utf8')
  }
}
