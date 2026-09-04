export const A2UI_ACTIVITY_TYPE = 'a2ui-surface'
export const A2UI_VERSION = 'v0.9'
export const A2UI_CATALOG_ID = 'https://opencode-agui-app.local/a2ui/data-agent-catalog.json'

export const A2UI_ALLOWED_COMPONENTS = new Set([
  'Text', 'Image', 'Icon', 'Video', 'AudioPlayer', 'Row', 'Column', 'List', 'Card', 'Tabs', 'Divider',
  'Modal', 'Button', 'TextField', 'CheckBox', 'ChoicePicker', 'Slider', 'DateTimeInput', 'MetricCard',
  'DataTable', 'BarChart', 'LineChart', 'PieChart', 'InsightCard', 'WarningCard', 'ActionButton', 'Badge',
  'Markdown',
])

const RETIRED_APPROVAL_ACTIONS = new Set(['request_user_confirm', 'hitl_confirm', 'hitl_cancel'])
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)

const jsonSize = (value) => {
  try { return JSON.stringify(value)?.length ?? 0 } catch { return Infinity }
}

const componentRefs = (component) => [
  ...(Array.isArray(component.children) ? component.children : []),
  component.child,
  component.trigger,
  component.content,
  ...(Array.isArray(component.tabs) ? component.tabs.map(tab => tab?.child) : []),
].filter(value => typeof value === 'string')

const flattenComponent = (value, result) => {
  if (!object(value) || !validId(value.id)) return false
  const component = Object.fromEntries(Object.entries(value).filter(([, nested]) => nested != null))
  const nested = []
  if (Array.isArray(component.children)) {
    component.children = component.children.map((child) => {
      if (typeof child === 'string') return child
      if (!object(child) || !validId(child.id)) return undefined
      nested.push(child)
      return child.id
    })
    if (component.children.some(child => child == null)) return false
  }
  if (object(component.child)) {
    nested.push(component.child)
    component.child = component.child.id
  }
  result.push(component)
  return nested.every(child => flattenComponent(child, result))
}

const normalizeComponents = (components) => {
  if (!Array.isArray(components) || components.length > 100) return null
  const flattened = []
  if (!components.every(component => flattenComponent(component, flattened)) || flattened.length > 100) return null
  const normalized = flattened.map((source) => {
    const component = { ...source }
    if (component.component === 'Text' && component.text == null && component.value != null) {
      component.text = component.value
      delete component.value
    }
    if (['Row', 'Column', 'List'].includes(component.component)) {
      if (component.justify == null && component.justifyContent != null) component.justify = component.justifyContent
      if (component.align == null && component.alignItems != null) component.align = component.alignItems
      delete component.justifyContent
      delete component.alignItems
    }
    return component
  })
  if (jsonSize(normalized) > 64 * 1024) return null
  const ids = new Set()
  for (const component of normalized) {
    if (!validId(component.id) || !A2UI_ALLOWED_COMPONENTS.has(component.component) || ids.has(component.id)) return null
    ids.add(component.id)
  }
  if (!ids.has('root')) return null
  if (normalized.some(component => componentRefs(component).some(reference => !ids.has(reference)))) return null
  const graph = new Map(normalized.map(component => [component.id, componentRefs(component)]))
  const visiting = new Set()
  const visited = new Set()
  const visit = (id, depth = 1) => {
    if (depth > 48 || visiting.has(id)) return false
    if (visited.has(id)) return true
    visiting.add(id)
    if (!(graph.get(id) ?? []).every(child => visit(child, depth + 1))) return false
    visiting.delete(id)
    visited.add(id)
    return true
  }
  return visit('root') ? normalized : null
}

export function normalizeRenderA2uiArgs(value) {
  let input = value
  if (typeof input === 'string') {
    if (input.length > 64 * 1024) return null
    try { input = JSON.parse(input) } catch { return null }
  }
  if (!object(input) || !validId(input.surfaceId) || !Array.isArray(input.components)) return null
  if (!input.components.length) return { surfaceId: input.surfaceId, components: [], catalogId: A2UI_CATALOG_ID }
  const components = normalizeComponents(input.components)
  if (!components) return null
  const data = object(input.data) || Array.isArray(input.data) ? structuredClone(input.data) : undefined
  if (jsonSize(data) > 64 * 1024) return null
  return { surfaceId: input.surfaceId, components, ...(data === undefined ? {} : { data }), catalogId: A2UI_CATALOG_ID }
}

export function hasA2uiCapability(input) {
  if (input?.forwardedProps?.a2uiCatalogAvailable !== true) return false
  return Array.isArray(input.context) && input.context.some(entry =>
    typeof entry?.description === 'string' && entry.description.toUpperCase().includes('A2UI'))
}

export function normalizeA2uiAction(value) {
  if (jsonSize(value) > 32 * 1024) return null
  const action = object(value?.action) ? value.action : value
  if (!object(action) || typeof action.name !== 'string' || !action.name.trim()
    || RETIRED_APPROVAL_ACTIONS.has(action.name)) return null
  const normalized = {
    name: action.name.slice(0, 160),
    ...(validId(action.surfaceId) ? { surfaceId: action.surfaceId } : {}),
    ...(validId(action.sourceComponentId) ? { sourceComponentId: action.sourceComponentId } : {}),
    ...(typeof action.timestamp === 'string' || typeof action.timestamp === 'number' ? { timestamp: action.timestamp } : {}),
    ...(object(action.context) ? { context: structuredClone(action.context) } : {}),
  }
  return { version: A2UI_VERSION, action: normalized }
}

export function buildA2uiActionPrompt(action) {
  return [
    `A2UI_ACTION: ${JSON.stringify(action)}`,
    'The user interacted with an A2UI surface rendered earlier in this conversation.',
    'Respond normally. If the interface should change, call render_a2ui with the SAME surfaceId to update it in place.',
    'Filtering, submitting, drilling down, and refreshing must update the surface through render_a2ui rather than text alone.',
  ].join('\n')
}

export const RENDER_A2UI_TOOL = {
  name: 'render_a2ui',
  description: 'Render or update a declarative A2UI v0.9 surface. Use only catalog components; root id is required. Empty components closes the surface. Never use this tool for approval.',
  inputSchema: {
    type: 'object',
    properties: {
      surfaceId: { type: 'string' },
      components: { type: 'array', items: { type: 'object', additionalProperties: true } },
      data: { type: ['object', 'array'] },
      catalogId: { type: 'string' },
    },
    required: ['surfaceId', 'components'],
    additionalProperties: false,
  },
}
