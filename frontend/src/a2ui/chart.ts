import { z } from 'zod'

const datum = z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
const data = z.array(datum).max(10_000)
export const ChartSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['bar', 'line']), title: z.string().optional(), xField: z.string().min(1), yField: z.string().min(1), data }),
  z.object({ kind: z.literal('pie'), title: z.string().optional(), labelField: z.string().min(1), valueField: z.string().min(1), data }),
])
export type ChartSpec = z.infer<typeof ChartSpecSchema>

export function buildChartOption(input: unknown) {
  const spec = ChartSpecSchema.parse(input)
  if (spec.kind === 'pie') {
    return {
      title: spec.title ? { text: spec.title, left: 'center' } : undefined,
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{ type: 'pie', radius: ['38%', '68%'], data: spec.data.map(row => ({ name: String(row[spec.labelField] ?? ''), value: Number(row[spec.valueField] ?? 0) })) }],
    }
  }
  return {
    title: spec.title ? { text: spec.title, left: 'center' } : undefined,
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 24, top: spec.title ? 56 : 24, bottom: 42 },
    xAxis: { type: 'category', data: spec.data.map(row => String(row[spec.xField] ?? '')) },
    yAxis: { type: 'value' },
    series: [{ type: spec.kind, data: spec.data.map(row => Number(row[spec.yField] ?? 0)), smooth: spec.kind === 'line' }],
  }
}
