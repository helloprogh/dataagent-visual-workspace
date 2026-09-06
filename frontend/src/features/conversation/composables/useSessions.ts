import { computed, ref } from 'vue'
import { fetchConversationSessions } from '../api/history'
import { renameConversation } from '../api/session'
import type { ConversationSession } from '../types'

const ACTIVE_KEY = 'dataagent.conversations.active.v3'
const ALIAS_KEY = 'dataagent.conversations.aliases.v1'

function readAliases(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(ALIAS_KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim())))
  } catch { return {} }
}

export function useSessions() {
  const sessions = ref<ConversationSession[]>([])
  const linkedSession = new URLSearchParams(window.location.search).get('session')?.trim() ?? ''
  const activeId = ref(linkedSession || localStorage.getItem(ACTIVE_KEY) || '')
  const aliases = ref<Record<string, string>>(readAliases())
  const loading = ref(false)
  const error = ref('')
  const renaming = new Set<string>()
  const savedNames = new Map<string, { name: string; revision: number }>()
  let revision = 0
  let refreshGeneration = 0

  const decoratedSessions = computed(() => sessions.value.map(session => ({
    ...session,
    displayName: aliases.value[session.id] || session.displayName,
  })))
  const rootSessions = computed(() => decoratedSessions.value.filter(session => !session.parentId && session.archivedAt == null))
  const activeSession = computed(() => rootSessions.value.find(session => session.id === activeId.value))

  function setActive(id: string) {
    activeId.value = id
    if (id) {
      localStorage.setItem(ACTIVE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_KEY)
    }
  }

  function startNew() {
    setActive('')
  }

  function select(id: string) {
    setActive(id)
  }

  async function rename(id: string, name: string) {
    const normalized = name.trim()
    if (!normalized) throw new Error('对话名称不能为空')
    if (renaming.has(id)) throw new Error('正在保存此对话名称，请稍后重试')
    renaming.add(id)
    try {
      await renameConversation(id, normalized)
      savedNames.set(id, { name: normalized, revision: ++revision })
      sessions.value = sessions.value.map(item => item.id === id ? { ...item, displayName: normalized } : item)
      // Migrate a legacy alias only after the server acknowledges the title.
      const next = { ...aliases.value }
      delete next[id]
      aliases.value = next
      try { localStorage.setItem(ALIAS_KEY, JSON.stringify(next)) } catch { /* Server remains authoritative. */ }
    } finally {
      renaming.delete(id)
    }
  }

  function materialize(id: string, displayName: string) {
    if (!sessions.value.some(item => item.id === id)) {
      const now = Date.now()
      sessions.value = [{ id, displayName, createdAt: now, updatedAt: now }, ...sessions.value]
    }
    setActive(id)
  }

  async function refresh(initial = false) {
    const generation = ++refreshGeneration
    const startedRevision = revision
    if (initial) loading.value = true
    error.value = ''
    try {
      const fetched = await fetchConversationSessions()
      if (generation !== refreshGeneration) return
      sessions.value = fetched.map(item => {
        const saved = savedNames.get(item.id)
        return saved && saved.revision > startedRevision ? { ...item, displayName: saved.name } : item
      })
      if (activeId.value && !rootSessions.value.some(item => item.id === activeId.value)) {
        setActive(rootSessions.value[0]?.id ?? '')
      }
    } catch (reason) {
      if (generation !== refreshGeneration) return
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      if (generation === refreshGeneration) loading.value = false
    }
  }

  return {
    sessions: decoratedSessions,
    rootSessions,
    activeId,
    activeSession,
    loading,
    error,
    refresh,
    startNew,
    select,
    rename,
    materialize,
  }
}
