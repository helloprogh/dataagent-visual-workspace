// Application-owned card contract. AG-UI transports it; no generated code is executed.
export const UI_ACTIVITY_TYPE = 'dataagent.ui'
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const string = (value, limit = 2000) => typeof value === 'string' ? value.slice(0, limit) : ''
const scalar = value => typeof value === 'number' && Number.isFinite(value) ? value : string(value)
const id = value => typeof value === 'string' && /^[\w-]{1,80}$/.test(value)
const list = (value, limit) => Array.isArray(value) && value.length <= limit

const safeWorkspacePath = value => {
  if (typeof value !== 'string' || !value.trim() || value.includes('\u0000')
    || value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(value)) return false
  return !value.split(/[\\/]+/).some(segment => segment === '..')
}

export function safeUiFileUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value, 'http://dataagent.local')
    if (url.origin !== 'http://dataagent.local' || /[\\\u0000-\u0020]/.test(value)) return ''
    if (/^\/dataagent\/web\/api\/agui\/file\/[0-9a-f-]{36}$/i.test(url.pathname)) return url.pathname + url.search
    if (!['/dataagent/web/api/agui/workspace-file', '/dataagent/web/api/agui/workspace-archive'].includes(url.pathname)
      || url.searchParams.size !== 1 || !url.searchParams.has('path') || !safeWorkspacePath(url.searchParams.get('path'))) return ''
    return url.pathname + url.search
  } catch { return '' }
}

export function normalizeUiContent(value) {
  if (!object(value) || value.version !== 1 || !id(value.surfaceId)) return null
  try { if (JSON.stringify(value).length > 65536) return null } catch { return null }
  if (!['generating', 'ready', 'error', 'removed'].includes(value.status) || !list(value.cards, 12)) return null
  const ids = new Set()
  const cards = []
  for (const source of value.cards) {
    if (!object(source) || !id(source.id) || ids.has(source.id)) return null
    ids.add(source.id)
    const card = { id: source.id, kind: source.kind, title: string(source.title, 160) }
    if (['text', 'markdown'].includes(source.kind)) card.text = string(source.text, 24000)
    else if (source.kind === 'metrics') {
      if (!list(source.items, 24)) return null
      card.items = source.items.map(item => ({ label: string(item?.label, 120), value: scalar(item?.value), detail: string(item?.detail, 240) }))
    } else if (source.kind === 'table') {
      if (!list(source.columns, 20) || !source.columns.length || !list(source.rows, 200)) return null
      if (source.columns.some(column => !object(column) || !id(column.key))) return null
      if (new Set(source.columns.map(column => column.key)).size !== source.columns.length) return null
      card.columns = source.columns.map(column => ({ key: column.key, label: string(column.label, 120) }))
      if (source.rows.some(row => !object(row))) return null
      card.rows = source.rows.map(row => Object.fromEntries(card.columns.map(column => [column.key, scalar(row[column.key])])))
    } else if (source.kind === 'file') {
      card.url = safeUiFileUrl(source.url)
      if (!card.url) return null
      card.name = string(source.name, 200) || card.title || '生成文件'
      card.mimeType = string(source.mimeType, 120) || 'application/octet-stream'
      if (source.approvalMode === 'next-interrupt') card.approvalMode = 'next-interrupt'
      const approvalInterruptId = string(source.approvalInterruptId, 200)
      if (approvalInterruptId) card.approvalInterruptId = approvalInterruptId
    } else return null
    cards.push(card)
  }
  return { version: 1, surfaceId: value.surfaceId, title: string(value.title, 160) || '生成结果',
    summary: string(value.summary), status: value.status, cards }
}

// Deliberately narrow JSON Patch subset: never traverse arbitrary object keys.
export function applyUiPatch(content, patch) {
  if (!content || !list(patch, 32)) return null
  const next = structuredClone(content)
  for (const operation of patch) {
    if (!object(operation) || !['add', 'replace'].includes(operation.op)
      || !/^\/(title|summary|status|cards)$/.test(operation.path)) return null
    next[operation.path.slice(1)] = operation.value
  }
  return normalizeUiContent(next)
}

// Only explicit structured tool output is a delivery; never parse chat prose as UI.
export function uiContentFromToolOutput(output) {
  let value = output
  if (Array.isArray(value)) {
    const texts = value.filter(item => item?.type === 'text' && typeof item.text === 'string').map(item => item.text)
    const parsed = texts.map(text => uiContentFromToolOutput(text)).filter(Boolean)
    if (parsed.length === 1) return parsed[0]
    if (parsed.length > 1) return null
    value = texts.join('')
  }
  if (typeof value === 'string') {
    if (value.length > 65536) return null
    try { value = JSON.parse(value) } catch { return null }
  }
  const content = object(value) ? normalizeUiContent(value.dataagentUi) : null
  if (!content) return null
  // A model/tool result may request that its next form be linked, but it may
  // not claim an interrupt id or mark an approval as already handled. The
  // adapter is the only authority that knows the real form created in this run.
  return {
    ...content,
    cards: content.cards.map(card => {
      if (card.kind !== 'file' || !card.approvalInterruptId) return card
      const { approvalInterruptId: _ignored, ...safeCard } = card
      return safeCard
    }),
  }
}
