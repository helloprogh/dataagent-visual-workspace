import { onBeforeUnmount, ref, shallowRef } from 'vue'
import type { HttpAgent, Interrupt, Message, ResumeEntry } from '@ag-ui/client'
import { createAgentClient } from '../../../agui/client'
import { fetchConversationMessagePage } from '../api/history'
import { createConversation, interruptConversation, uploadConversationFile } from '../api/session'
import type { ModelSelection } from '../../model/types'

export type PendingAttachment = {
  id: string
  file: File
}

export function useAgentConversation() {
  const agent = shallowRef<HttpAgent | null>(null)
  const threadId = ref('')
  const messages = ref<Message[]>([])
  const running = ref(false)
  const hydrating = ref(false)
  const loadingOlder = ref(false)
  const nextCursor = ref<string>()
  const pendingInterrupts = ref<Interrupt[]>([])
  const attachments = ref<PendingAttachment[]>([])
  const error = ref('')
  let subscription: { unsubscribe: () => void } | null = null
  let generation = 0

  function syncMessages() {
    messages.value = agent.value ? [...agent.value.messages] : []
  }

  function detach() {
    subscription?.unsubscribe()
    subscription = null
    if (agent.value?.isRunning) agent.value.abortRun()
    agent.value = null
    messages.value = []
    pendingInterrupts.value = []
    nextCursor.value = undefined
  }

  function bind(next: HttpAgent) {
    subscription?.unsubscribe()
    subscription = next.subscribe({
      onMessagesChanged: ({ messages: nextMessages }) => {
        messages.value = [...nextMessages]
      },
      onRunFinishedEvent: ({ event }) => {
        pendingInterrupts.value = event.outcome?.type === 'interrupt'
          ? [...event.outcome.interrupts]
          : []
      },
      onRunErrorEvent: ({ event }) => {
        error.value = event.message
      },
    })
  }

  async function open(sessionId: string) {
    const id = sessionId.trim()
    const currentGeneration = ++generation
    detach()
    threadId.value = id
    error.value = ''
    if (!id) return

    hydrating.value = true
    try {
      const page = await fetchConversationMessagePage(id)
      if (currentGeneration !== generation) return
      const next = createAgentClient(id)
      next.setMessages(page.messages)
      agent.value = next
      nextCursor.value = page.nextCursor
      bind(next)
      syncMessages()
    } catch (reason) {
      if (currentGeneration === generation) error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      if (currentGeneration === generation) hydrating.value = false
    }
  }

  async function loadOlder() {
    const id = threadId.value
    const cursor = nextCursor.value
    const target = agent.value
    if (!id || !cursor || !target || loadingOlder.value) return
    loadingOlder.value = true
    try {
      const page = await fetchConversationMessagePage(id, cursor)
      const known = new Set(target.messages.map(message => message.id))
      const older = page.messages.filter(message => !known.has(message.id))
      if (older.length) target.setMessages([...older, ...target.messages])
      nextCursor.value = page.nextCursor
      syncMessages()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loadingOlder.value = false
    }
  }

  function stageFiles(files: FileList | File[]) {
    const source = Array.from(files)
    attachments.value = [
      ...attachments.value,
      ...source.map(file => ({ id: crypto.randomUUID(), file })),
    ]
  }

  function removeAttachment(id: string) {
    attachments.value = attachments.value.filter(item => item.id !== id)
  }

  async function ensureAgent(model: ModelSelection, initialText: string) {
    if (agent.value && threadId.value) return { client: agent.value, sessionId: threadId.value, created: false }
    const sessionId = await createConversation(model)
    const client = createAgentClient(sessionId)
    agent.value = client
    threadId.value = sessionId
    bind(client)
    return { client, sessionId, created: true, initialName: deriveConversationName(initialText) }
  }

  async function send(text: string, model: ModelSelection) {
    const value = text.trim()
    if ((!value && !attachments.value.length) || running.value || pendingInterrupts.value.length) return null
    error.value = ''
    running.value = true
    try {
      const prepared = await ensureAgent(model, value)
      const uploaded = []
      for (const item of attachments.value) uploaded.push(await uploadConversationFile(item.file, prepared.sessionId))
      const content = uploaded.length
        ? [
            ...(value ? [{ type: 'text', text: value }] : []),
            ...uploaded,
          ]
        : value
      const userMessage = {
        id: `msg-${crypto.randomUUID()}`,
        role: 'user',
        content,
      } as Message
      prepared.client.addMessage(userMessage)
      attachments.value = []
      syncMessages()
      await prepared.client.runAgent()
      syncMessages()
      return prepared
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      throw reason
    } finally {
      running.value = false
    }
  }

  async function resume(entries: ResumeEntry[]) {
    const target = agent.value
    if (!target || running.value || !pendingInterrupts.value.length) return
    const required = new Set(pendingInterrupts.value.map(item => item.id))
    const provided = new Set(entries.map(item => item.interruptId))
    if (required.size !== provided.size || [...required].some(id => !provided.has(id))) {
      throw new Error('必须一次处理当前 Run 的全部待处理中断')
    }
    running.value = true
    error.value = ''
    try {
      pendingInterrupts.value = []
      await target.runAgent({ resume: entries } as any)
      syncMessages()
    } catch (reason) {
      pendingInterrupts.value = [...(target as any).pendingInterrupts ?? []]
      error.value = reason instanceof Error ? reason.message : String(reason)
      throw reason
    } finally {
      running.value = false
    }
  }

  async function stop() {
    const id = threadId.value
    const target = agent.value
    if (target?.isRunning) target.abortRun()
    running.value = false
    if (id) await interruptConversation(id)
  }

  function deriveConversationName(value: string) {
    const normalized = value.replace(/\s+/g, ' ').trim()
    if (!normalized) return '新需求'
    return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized
  }

  onBeforeUnmount(() => {
    generation += 1
    detach()
  })

  return {
    agent,
    threadId,
    messages,
    running,
    hydrating,
    loadingOlder,
    nextCursor,
    pendingInterrupts,
    attachments,
    error,
    open,
    loadOlder,
    stageFiles,
    removeAttachment,
    send,
    resume,
    stop,
  }
}
