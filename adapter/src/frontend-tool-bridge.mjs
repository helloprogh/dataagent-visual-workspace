import { randomUUID } from 'node:crypto'

const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const contentText = (content) => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((item) => item?.text ?? item?.content ?? '').join('')
  return content == null ? '' : JSON.stringify(content)
}

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

export class FrontendToolBridge {
  constructor({ timeoutMs = 10 * 60 * 1000 } = {}) {
    this.timeoutMs = timeoutMs
    this.catalogs = new Map()
    this.globalCatalog = []
    this.pending = new Map()
    this.waitingInvocations = new Map()
    this.suppressed = new Map()
  }

  serverName() {
    return 'agui_frontend'
  }

  updateCatalog(threadId, tools = []) {
    const catalog = tools
      .filter((tool) => tool?.name && tool?.parameters)
      .map((tool) => ({
        name: tool.name,
        description: tool.description || `Execute the ${tool.name} action in the connected AG-UI frontend.`,
        inputSchema: tool.parameters,
      }))
    this.catalogs.set(threadId, catalog)
    this.globalCatalog = catalog
    return catalog
  }

  tools(threadId) {
    return threadId ? (this.catalogs.get(threadId) ?? []) : this.globalCatalog
  }

  resolveName(threadId, nativeName) {
    const tools = this.tools(threadId)
    const exact = tools.find((tool) => tool.name === nativeName)
    if (exact) return exact.name
    const normalizedNative = normalize(nativeName)
    return tools.find((tool) => normalizedNative.endsWith(normalize(tool.name)))?.name
  }

  isFrontendTool(threadId, nativeName) {
    return Boolean(this.resolveName(threadId, nativeName))
  }

  registerNativeCall(threadId, { toolCallId, nativeName, args }) {
    const toolName = this.resolveName(threadId, nativeName)
    if (!toolName) return undefined
    const id = String(toolCallId || `frontend-tool-${randomUUID()}`)
    let call = this.pending.get(id)
    if (!call) {
      const result = deferred()
      call = { id, threadId, toolName, nativeName, args, result, bound: false, settled: false }
      this.pending.set(id, call)
    }
    const key = this.invocationKey(threadId, toolName)
    const globalKey = this.invocationKey('*', toolName)
    const waiterKey = this.waitingInvocations.get(key)?.length ? key : globalKey
    const waiter = this.waitingInvocations.get(waiterKey)?.shift()
    if (waiter) {
      call.bound = true
      waiter.resolve(call)
      if (!this.waitingInvocations.get(waiterKey)?.length) this.waitingInvocations.delete(waiterKey)
    }
    return call
  }

  invocationKey(threadId, toolName) {
    return `${threadId}\u0000${toolName}`
  }

  async waitForCall(threadId, toolName) {
    const existing = [...this.pending.values()].find((call) =>
      call.threadId === threadId && call.toolName === toolName && !call.bound)
    if (existing) {
      existing.bound = true
      return existing
    }
    const waiter = deferred()
    const key = this.invocationKey(threadId, toolName)
    const list = this.waitingInvocations.get(key) ?? []
    list.push(waiter)
    this.waitingInvocations.set(key, list)
    const timeout = setTimeout(() => waiter.reject(new Error(`Timed out waiting for AG-UI tool call ${toolName}`)), 5000)
    try {
      return await waiter.promise
    } finally {
      clearTimeout(timeout)
    }
  }

  async invoke(threadId, toolName) {
    const resolvedName = this.resolveName(threadId, toolName) ?? toolName
    const call = await this.waitForCall(threadId, resolvedName)
    const timeout = setTimeout(() => {
      if (!call.settled) call.result.reject(new Error(`AG-UI frontend did not return ${resolvedName} within ${this.timeoutMs}ms`))
    }, this.timeoutMs)
    try {
      return await call.result.promise
    } finally {
      clearTimeout(timeout)
      this.pending.delete(call.id)
    }
  }

  async invokeAny(toolName) {
    const matching = [...this.pending.values()].find((call) => call.toolName === toolName && !call.bound)
    if (matching) {
      matching.bound = true
      return this.awaitResult(matching, toolName)
    }
    const waiter = deferred()
    const key = this.invocationKey('*', toolName)
    const list = this.waitingInvocations.get(key) ?? []
    list.push(waiter)
    this.waitingInvocations.set(key, list)
    const callTimeout = setTimeout(() => waiter.reject(new Error(`Timed out waiting for AG-UI tool call ${toolName}`)), 5000)
    let call
    try {
      call = await waiter.promise
    } finally {
      clearTimeout(callTimeout)
    }
    return this.awaitResult(call, toolName)
  }

  async awaitResult(call, toolName) {
    const timeout = setTimeout(() => {
      if (!call.settled) call.result.reject(new Error(`AG-UI frontend did not return ${toolName} within ${this.timeoutMs}ms`))
    }, this.timeoutMs)
    try {
      return await call.result.promise
    } finally {
      clearTimeout(timeout)
      this.pending.delete(call.id)
    }
  }

  acceptToolMessages(threadId, messages = []) {
    const accepted = []
    for (const message of messages) {
      if (message?.role !== 'tool' || !message.toolCallId) continue
      const call = this.pending.get(String(message.toolCallId))
      if (!call || call.threadId !== threadId || call.settled) continue
      call.settled = true
      const text = contentText(message.content)
      const error = message.error ? String(message.error) : undefined
      call.result.resolve({ text, error })
      const suppressed = this.suppressed.get(threadId) ?? new Set()
      suppressed.add(call.id)
      this.suppressed.set(threadId, suppressed)
      accepted.push(call.id)
    }
    return accepted
  }

  pendingCall(threadId, toolCallId) {
    const call = this.pending.get(String(toolCallId))
    return call?.threadId === threadId ? call : undefined
  }

  shouldSuppress(threadId, toolCallId, terminal = false) {
    const suppressed = this.suppressed.get(threadId)
    const id = String(toolCallId)
    if (!suppressed?.has(id)) return false
    if (terminal) {
      suppressed.delete(id)
      if (!suppressed.size) this.suppressed.delete(threadId)
    }
    return true
  }
}
