// One contract for server validation, client advertisement and renderer registration.
export const A2UI_VERSION = 'v0.9'
export const A2UI_CATALOG_ID = 'https://opencode-agui-app.local/a2ui/data-agent-catalog.json'
export const A2UI_COMPONENT_NAMES = Object.freeze([
  'Text', 'Image', 'Icon', 'Video', 'AudioPlayer', 'Row', 'Column', 'List', 'Card', 'Tabs', 'Divider',
  'Modal', 'Button', 'TextField', 'CheckBox', 'ChoicePicker', 'Slider', 'DateTimeInput', 'MetricCard',
  'DataTable', 'BarChart', 'LineChart', 'PieChart', 'InsightCard', 'WarningCard', 'ActionButton', 'Badge',
  'Markdown',
])

export function assertA2uiCatalogComponents(names) {
  const actual = new Set(names)
  const expected = new Set(A2UI_COMPONENT_NAMES)
  const missing = [...expected].filter(name => !actual.has(name))
  const unexpected = [...actual].filter(name => !expected.has(name))
  if (missing.length || unexpected.length) {
    throw new Error(`A2UI catalog mismatch: missing [${missing.join(', ')}]; unexpected [${unexpected.join(', ')}]`)
  }
}
