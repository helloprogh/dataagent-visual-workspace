import { h, ref } from 'vue'
import { z } from 'zod'
import { Catalog } from '@a2ui/web_core/v0_9'
import { BASIC_FUNCTIONS, ButtonApi } from '@a2ui/web_core/v0_9/basic_catalog'
import { MarkdownRenderer } from 'x-markdown-vue'
import { appTheme } from '../shared/theme/theme'
import { A2UI_ALLOWED_COMPONENTS, DATA_AGENT_CATALOG_ID } from './capability'
import { createVueComponent } from './createVueComponent'
import { dataAgentBasicCatalog } from './basicCatalog'
import EChartView from './EChartView.vue'

export { A2UI_ALLOWED_COMPONENTS, DATA_AGENT_CATALOG_ID }

const bindable = (type: z.ZodTypeAny) => z.union([type, z.object({ path: z.string() })])
const boundString = bindable(z.string())
const rowData = z.array(z.record(z.string(), z.any()))
const columnDef = z.union([
  z.string(),
  z.object({ key: z.string(), label: z.string().optional(), title: z.string().optional() }),
])

const cardStyle = {
  color: 'var(--da-text-primary)',
  background: 'var(--da-surface-1)',
  border: '0.0625rem solid var(--da-border)',
  borderRadius: 'var(--da-radius-md)',
  padding: '0.875rem 1rem',
  margin: '0.5rem',
  boxSizing: 'border-box' as const,
}
const titleStyle = { fontSize: '0.75rem', color: 'var(--da-text-muted)', margin: '0 0 0.25rem' }
const valueStyle = { fontSize: '1.375rem', fontWeight: 700, color: 'var(--da-text-emphasis)', margin: '0' }

const MetricCard = createVueComponent({
  name: 'MetricCard',
  schema: z.object({
    title: boundString,
    value: bindable(z.union([z.string(), z.number()])),
    delta: boundString.optional(),
    trend: z.enum(['up', 'down', 'flat']).optional(),
  }),
} as any, ({ props }: any) => {
  const trendColor = props.trend === 'down' ? '#ef4444' : props.trend === 'flat' ? 'var(--da-text-muted)' : '#10b981'
  return h('div', { style: cardStyle }, [
    h('p', { style: titleStyle }, String(props.title ?? '')),
    h('p', { style: valueStyle }, String(props.value ?? '')),
    props.delta != null ? h('p', { style: { ...titleStyle, color: trendColor, margin: '0.25rem 0 0' } }, String(props.delta)) : null,
  ])
})

const DataTable = createVueComponent({
  name: 'DataTable',
  schema: z.object({
    title: boundString.optional(),
    columns: z.array(columnDef),
    rows: bindable(z.array(z.union([z.array(z.union([z.string(), z.number()])), z.record(z.string(), z.any())]))),
  }),
} as any, ({ props }: any) => {
  const columns: { key: string; label: string }[] = (props.columns ?? []).map((column: any) => typeof column === 'string'
    ? { key: column, label: column }
    : { key: String(column?.key ?? ''), label: String(column?.label ?? column?.title ?? column?.key ?? '') })
  const rows: any[] = (props.rows ?? []).map((row: any) => Array.isArray(row) ? row : columns.map(column => row?.[column.key] ?? ''))
  const cell = { padding: '0.5rem 0.625rem', borderBottom: '0.0625rem solid var(--da-border)', fontSize: '0.8125rem', textAlign: 'left' as const }
  return h('div', { style: { ...cardStyle, overflowX: 'auto' } }, [
    props.title ? h('p', { style: titleStyle }, String(props.title)) : null,
    h('table', { style: { width: '100%', borderCollapse: 'collapse' } }, [
      h('thead', [h('tr', columns.map(column => h('th', { key: column.key, style: { ...cell, color: 'var(--da-text-muted)', background: 'var(--da-surface-2)' } }, column.label)))]),
      h('tbody', rows.map((row, rowIndex) => h(
        'tr',
        { key: rowIndex },
        row.map((value: unknown, columnIndex: number) => h('td', { key: columnIndex, style: cell }, String(value))),
      ))),
    ]),
  ])
})

const chartSchema = z.object({ title: boundString.optional(), xField: z.string(), yField: z.string(), data: bindable(rowData) })
const BarChart = createVueComponent({ name: 'BarChart', schema: chartSchema } as any, ({ props }: any) =>
  h(EChartView, { spec: { kind: 'bar', title: props.title, xField: props.xField, yField: props.yField, data: props.data ?? [] } }))
const LineChart = createVueComponent({ name: 'LineChart', schema: chartSchema } as any, ({ props }: any) =>
  h(EChartView, { spec: { kind: 'line', title: props.title, xField: props.xField, yField: props.yField, data: props.data ?? [] } }))
const PieChart = createVueComponent({
  name: 'PieChart',
  schema: z.object({ title: boundString.optional(), labelField: z.string(), valueField: z.string(), data: bindable(rowData) }),
} as any, ({ props }: any) => h(EChartView, {
  spec: { kind: 'pie', title: props.title, labelField: props.labelField, valueField: props.valueField, data: props.data ?? [] },
}))

const InsightCard = createVueComponent({
  name: 'InsightCard', schema: z.object({ title: boundString, text: boundString, variant: z.enum(['info', 'success']).optional() }),
} as any, ({ props }: any) => h('div', { style: { ...cardStyle, borderLeft: '0.25rem solid var(--da-accent-blue)', background: 'color-mix(in srgb, var(--da-accent-blue) 8%, var(--da-surface-1))' } }, [
  h('p', { style: { ...titleStyle, color: 'var(--da-accent-blue)' } }, String(props.title ?? '')),
  h('p', { style: { margin: 0, fontSize: '0.8125rem' } }, String(props.text ?? '')),
]))

const WarningCard = createVueComponent({
  name: 'WarningCard', schema: z.object({ title: boundString, text: boundString }),
} as any, ({ props }: any) => h('div', { style: { ...cardStyle, borderLeft: '0.25rem solid var(--da-accent-orange)', background: 'color-mix(in srgb, var(--da-accent-orange) 8%, var(--da-surface-1))' } }, [
  h('p', { style: { ...titleStyle, color: 'var(--da-accent-orange)' } }, String(props.title ?? '')),
  h('p', { style: { margin: 0, fontSize: '0.8125rem' } }, String(props.text ?? '')),
]))

const badgeVariants: Record<string, { background: string; color: string }> = {
  default: { background: 'var(--da-surface-2)', color: 'var(--da-text-secondary)' },
  success: { background: '#ecfdf5', color: '#047857' },
  warning: { background: '#fffbeb', color: '#b45309' },
  danger: { background: '#fef2f2', color: '#b91c1c' },
  info: { background: '#eef2ff', color: '#4338ca' },
}
const Badge = createVueComponent({
  name: 'Badge', schema: z.object({ text: boundString, variant: z.enum(['default', 'success', 'warning', 'danger', 'info']).optional() }),
} as any, ({ props }: any) => h('span', { style: {
  display: 'inline-block', padding: '0.1875rem 0.625rem', margin: '0.25rem', borderRadius: '999rem', fontSize: '0.75rem', fontWeight: 600,
  ...(badgeVariants[props.variant ?? 'default'] ?? badgeVariants.default),
} }, String(props.text ?? '')))

const Markdown = createVueComponent({ name: 'Markdown', schema: z.object({ text: boundString }) } as any, ({ props }: any) =>
  h('div', { style: cardStyle }, [h(MarkdownRenderer, {
    markdown: String(props.text ?? ''), sanitize: true, isDark: appTheme.value === 'dark', enableShiki: false, enableMermaid: false,
  })]))

const ActionButton = createVueComponent({
  name: 'ActionButton',
  schema: z.object({
    label: boundString,
    variant: z.enum(['default', 'primary', 'borderless']).optional(),
    action: z.union([z.object({ event: z.object({ name: z.string(), context: z.record(z.string(), z.any()).optional() }) })] as any),
  }),
} as any, ({ props, state }: any) => h('button', {
  'data-a2ui-action': String(props.label ?? 'action'),
  disabled: state.busy.value,
  'aria-busy': state.busy.value ? 'true' : undefined,
  style: {
    margin: '0.5rem', padding: '0.5rem 1rem', border: props.variant === 'borderless' ? 'none' : '0.0625rem solid var(--da-border)',
    borderRadius: 'var(--da-radius-sm)', color: props.variant === 'primary' ? '#fff' : 'var(--da-text-primary)',
    background: props.variant === 'primary' ? 'var(--da-accent-primary)' : props.variant === 'borderless' ? 'transparent' : 'var(--da-surface-1)',
    cursor: state.busy.value ? 'wait' : 'pointer', opacity: state.busy.value ? 0.6 : 1,
  },
  onClick: () => {
    if (state.busy.value) return
    state.busy.value = true
    setTimeout(() => { state.busy.value = false }, 6000)
    props.action?.()
  },
}, state.busy.value ? `正在处理 ${String(props.label ?? '')}…` : String(props.label ?? 'Action')), () => ({ busy: ref(false) }))

const DataAgentButton = createVueComponent(ButtonApi, ({ props, buildChild }) => {
  const disabled = props.isValid === false
  return h('button', {
    disabled,
    onClick: disabled ? undefined : props.action,
    style: {
      margin: '0.5rem', padding: '0.5rem 0.875rem', border: props.variant === 'borderless' && !disabled ? 'none' : '0.0625rem solid var(--da-border)',
      borderRadius: 'var(--da-radius-sm)', color: disabled ? 'var(--da-text-subtle)' : props.variant === 'primary' ? '#fff' : 'var(--da-text-primary)',
      background: disabled ? 'var(--da-surface-2)' : props.variant === 'primary' ? 'var(--da-accent-primary)' : props.variant === 'borderless' ? 'transparent' : 'var(--da-surface-1)',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.65 : 1,
    },
  }, props.child ? [buildChild(props.child)] : [])
})

export const dataAgentCatalog = new Catalog(
  DATA_AGENT_CATALOG_ID,
  [
    ...Array.from(dataAgentBasicCatalog.components.values()),
    MetricCard, DataTable, BarChart, LineChart, InsightCard, WarningCard,
    DataAgentButton, ActionButton, PieChart, Badge, Markdown,
  ] as any,
  BASIC_FUNCTIONS as any,
)
