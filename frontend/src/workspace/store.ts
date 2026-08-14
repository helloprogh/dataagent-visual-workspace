import { reactive } from 'vue'
import type { WorkspaceDocument, WorkspaceWidget } from './types'
import { createDemoDocument } from './demo-data'

// V3 intentionally does not read the previous V2 workspace key.
// V2 seeded every new thread with mock data, so reusing it could leak demo
// content into production after upgrading to the Empty Workspace behavior.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
// Production and demo persistence are deliberately isolated so switching
// VITE_DEMO_MODE can never surface demo KPI/Agent data in production.
const STORAGE_KEY = DEMO_MODE
  ? 'dataagent.workspace.v3.demo'
  : 'dataagent.workspace.v3.prod'

type WorkspaceMap = Record<string, WorkspaceDocument>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readAll(): WorkspaceMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as WorkspaceMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(all: WorkspaceMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

function createEmptyDocument(threadId: string): WorkspaceDocument {
  return {
    threadId,
    title: '智能分析工作区',
    subtitle: '告诉 Data Agent 你想分析什么，界面会随着分析过程动态生成',
    updatedAt: Date.now(),
    widgets: [],
  }
}

function createInitialDocument(threadId: string): WorkspaceDocument {
  return DEMO_MODE ? createDemoDocument(threadId) : createEmptyDocument(threadId)
}

const state = reactive<{ activeThreadId: string; document: WorkspaceDocument | null }>({
  activeThreadId: '',
  document: null,
})

function persist() {
  if (!state.document || !state.activeThreadId) return
  const all = readAll()
  all[state.activeThreadId] = clone(state.document)
  writeAll(all)
}

export const workspaceController = {
  state,
  demoMode: DEMO_MODE,
  activate(threadId: string) {
    if (!threadId) return
    const all = readAll()
    state.activeThreadId = threadId
    state.document = clone(all[threadId] ?? createInitialDocument(threadId))
    persist()
  },
  replace(payload: { title?: string; subtitle?: string; widgets: WorkspaceWidget[] }) {
    if (!state.activeThreadId) return
    state.document = {
      threadId: state.activeThreadId,
      title: payload.title || state.document?.title || '智能分析工作区',
      subtitle: payload.subtitle ?? state.document?.subtitle,
      updatedAt: Date.now(),
      widgets: clone(payload.widgets),
    }
    persist()
  },
  upsert(widget: WorkspaceWidget) {
    if (!state.document) return
    const widgets = [...state.document.widgets]
    const index = widgets.findIndex(item => item.id === widget.id)
    if (index >= 0) widgets[index] = clone(widget)
    else widgets.push(clone(widget))
    state.document.widgets = widgets
    state.document.updatedAt = Date.now()
    persist()
  },
  remove(id: string) {
    if (!state.document) return
    state.document.widgets = state.document.widgets.filter(item => item.id !== id)
    state.document.updatedAt = Date.now()
    persist()
  },
  clear() {
    if (!state.document) return
    state.document.widgets = []
    state.document.title = '智能分析工作区'
    state.document.subtitle = '告诉 Data Agent 你想分析什么，界面会随着分析过程动态生成'
    state.document.updatedAt = Date.now()
    persist()
  },
  reset() {
    if (!state.activeThreadId) return
    const all = readAll()
    delete all[state.activeThreadId]
    writeAll(all)
    state.document = createInitialDocument(state.activeThreadId)
    persist()
  },
}
