import { normalizeUiContent } from './generative-ui.mjs'
import { A2UI_CATALOG_ID } from './a2ui-catalog.mjs'

// Presentation-only adapter: persisted legacy snapshots remain untouched.
export function legacyUiToA2ui(value, messageId) {
  const content = normalizeUiContent(value)
  if (!content) return null
  const { surfaceId, title, summary, status } = content
  if (status === 'removed') return { title, summary, status, operations: [{ deleteSurface: { surfaceId } }], artifacts: [] }
  const components = [{ id: 'root', component: 'Column', children: [] }]
  const artifacts = []
  let sequence = 0
  const append = (component, parent = components[0]) => {
    const item = { id: `legacy-${sequence++}`, ...component }
    components.push(item)
    parent.children.push(item.id)
    return item
  }
  for (const card of content.cards) {
    const group = append({ component: 'Column', children: [] })
    if (card.title) append({ component: 'Text', text: card.title }, group)
    if (card.kind === 'text' || card.kind === 'markdown') append({ component: card.kind === 'text' ? 'Text' : 'Markdown', text: card.text }, group)
    else if (card.kind === 'metrics') {
      for (const item of card.items) append({ component: 'MetricCard', title: item.label, value: item.value, ...(item.detail ? { delta: item.detail, trend: 'flat' } : {}) }, group)
    } else if (card.kind === 'table') append({ component: 'DataTable', columns: card.columns, rows: card.rows }, group)
    else if (card.kind === 'file') {
      const artifactId = `${messageId}-${card.id}`
      artifacts.push({ id: artifactId, name: card.name, url: card.url, mimeType: card.mimeType, category: 'output',
        ...(card.approvalInterruptId ? { approvalInterruptId: card.approvalInterruptId } : {}) })
      append({ component: 'ArtifactCard', artifactId }, group)
    }
  }
  return { title, summary, status, artifacts, operations: [
    { createSurface: { surfaceId, catalogId: A2UI_CATALOG_ID } },
    { updateComponents: { surfaceId, components } },
  ] }
}
