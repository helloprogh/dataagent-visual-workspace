import { reactive } from 'vue'
import type { WorkspaceDocument, WorkspaceWidget } from './types'
import { createDemoDocument } from './demo-data'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
const STORAGE_KEY = DEMO_MODE
  ? 'dataagent.workspace.v4.demo.sa-delivery'
  : 'dataagent.workspace.v4.agui'
const DEFAULT_WORKSPACE_TITLE = 'Workspace'
const DEFAULT_WORKSPACE_SUBTITLE = '描述你的数据业务目标，我将与你逐步澄清需求，并自主完成 Specification、数据方案、数据集成、ETL 开发、治理验证与交付。'
const LEGACY_WORKSPACE_TITLES = new Set(['智能分析工作区'])
const LEGACY_WORKSPACE_SUBTITLES = new Set([
  '告诉 Data Agent 你想分析什么，界面会随着分析过程动态生成',
  '通过右侧 Data Agent 控制分析界面',
])

type WorkspaceMap = Record<string, WorkspaceDocument>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function isWorkspaceWidget(value: unknown): value is WorkspaceWidget {
  const widget = asRecord(value)
  return Boolean(widget && typeof widget.id === 'string' && typeof widget.component === 'string')
}

function parseSerializedValue(value: unknown): unknown {
  let parsed = value
  for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt += 1) {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return value
    }
  }
  return parsed
}

function normalizeChartWidget(widget: WorkspaceWidget): WorkspaceWidget {
  if (!['ui.lineChart', 'ui.areaChart', 'ui.barChart', 'ui.donutChart'].includes(widget.component)) return clone(widget)
  const props = clone(widget.props ?? {})
  const chartData = asRecord(props.data)
  const datasets = Array.isArray(chartData?.datasets) ? chartData.datasets : []
  const firstDataset = asRecord(datasets[0])
  const labels = Array.isArray(chartData?.labels)
    ? chartData.labels
    : (Array.isArray(props.labels) ? props.labels : [])
  const values = Array.isArray(firstDataset?.data)
    ? firstDataset.data
    : (Array.isArray(props.values) ? props.values : [])
  const points = labels.map((label, index) => ({
    label: String(label),
    value: Number(values[index]),
  })).filter(point => Number.isFinite(point.value))

  if (points.length) {
    if (['ui.lineChart', 'ui.areaChart'].includes(widget.component) && !Array.isArray(props.points)) props.points = points
    if (!['ui.lineChart', 'ui.areaChart'].includes(widget.component) && !Array.isArray(props.items)) props.items = points
  }

  const options = asRecord(props.options)
  const optionTitle = asRecord(options?.title)
  if (!props.title) {
    const title = optionTitle?.text ?? firstDataset?.label
    if (typeof title === 'string' && title.trim()) props.title = title
  }
  return { ...clone(widget), props }
}

function normalizeWidgets(widgets: unknown): WorkspaceWidget[] {
  const parsed = parseSerializedValue(widgets)
  const candidates = Array.isArray(parsed)
    ? parsed
    : isWorkspaceWidget(parsed)
      ? [parsed]
      : Object.values(asRecord(parsed) ?? {})

  return candidates.filter(isWorkspaceWidget).map(normalizeChartWidget)
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
    title: DEFAULT_WORKSPACE_TITLE,
    subtitle: DEFAULT_WORKSPACE_SUBTITLE,
    updatedAt: Date.now(),
    widgets: [],
  }
}

function createInitialDocument(threadId: string): WorkspaceDocument {
  return DEMO_MODE ? createDemoDocument(threadId) : createEmptyDocument(threadId)
}

function normalizeDocument(value: unknown, threadId: string): WorkspaceDocument {
  const fallback = createInitialDocument(threadId)
  const document = asRecord(value)
  if (!document) return fallback

  return {
    threadId,
    title: typeof document.title === 'string' && document.title.trim()
      ? (LEGACY_WORKSPACE_TITLES.has(document.title) ? DEFAULT_WORKSPACE_TITLE : document.title)
      : fallback.title,
    subtitle: typeof document.subtitle === 'string'
      ? (LEGACY_WORKSPACE_SUBTITLES.has(document.subtitle) ? DEFAULT_WORKSPACE_SUBTITLE : document.subtitle)
      : fallback.subtitle,
    updatedAt: typeof document.updatedAt === 'number' && Number.isFinite(document.updatedAt)
      ? document.updatedAt
      : 0,
    widgets: normalizeWidgets(document.widgets),
  }
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
    state.document = normalizeDocument(all[threadId], threadId)
    persist()
  },
  snapshot() {
    return state.document ? clone(state.document) : null
  },
  applyShared(document: WorkspaceDocument) {
    const shared = asRecord(document)
    if (!state.activeThreadId || shared?.threadId !== state.activeThreadId) return
    const normalized = normalizeDocument(shared, state.activeThreadId)
    const currentUpdatedAt = state.document?.updatedAt ?? 0
    if (normalized.updatedAt < currentUpdatedAt) return
    state.document = normalized
    persist()
  },
  replace(payload: { title?: string; subtitle?: string; widgets: WorkspaceWidget[] }) {
    if (!state.activeThreadId) return
    state.document = {
      threadId: state.activeThreadId,
      title: payload.title || state.document?.title || DEFAULT_WORKSPACE_TITLE,
      subtitle: payload.subtitle ?? state.document?.subtitle,
      updatedAt: Date.now(),
      widgets: normalizeWidgets(payload.widgets),
    }
    persist()
  },
  upsert(widget: WorkspaceWidget) {
    if (!state.document) return
    const widgets = [...state.document.widgets]
    const index = widgets.findIndex(item => item.id === widget.id)
    const normalized = normalizeChartWidget(widget)
    if (index >= 0) widgets[index] = normalized
    else widgets.push(normalized)
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
    state.document.title = DEFAULT_WORKSPACE_TITLE
    state.document.subtitle = DEFAULT_WORKSPACE_SUBTITLE
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
