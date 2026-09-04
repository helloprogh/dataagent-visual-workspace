export const DATA_AGENT_CATALOG_ID = 'https://opencode-agui-app.local/a2ui/data-agent-catalog.json'

export const A2UI_ALLOWED_COMPONENTS = Object.freeze([
  'Text', 'Image', 'Icon', 'Video', 'AudioPlayer',
  'Row', 'Column', 'List', 'Card', 'Tabs', 'Divider', 'Modal',
  'Button', 'TextField', 'CheckBox', 'ChoicePicker', 'Slider', 'DateTimeInput',
  'MetricCard', 'DataTable', 'BarChart', 'LineChart', 'PieChart',
  'InsightCard', 'WarningCard', 'ActionButton', 'Badge', 'Markdown',
])

export const A2UI_RUN_CAPABILITY = {
  forwardedProps: { a2uiCatalogAvailable: true },
  context: [{
    description: 'A2UI catalog capabilities: available catalog IDs and components the client can render.',
    value: JSON.stringify({ catalogId: DATA_AGENT_CATALOG_ID, components: A2UI_ALLOWED_COMPONENTS }),
  }],
}
