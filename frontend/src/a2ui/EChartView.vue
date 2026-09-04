<script setup lang="ts">
import type { ECharts } from 'echarts/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildChartOption, type ChartSpec } from './chart'

const props = defineProps<{ spec: ChartSpec }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
let observer: ResizeObserver | null = null
let disposed = false
const canvasAvailable = typeof navigator === 'undefined' || !/jsdom/i.test(navigator.userAgent)
const fallbackRows = computed(() => props.spec.data.map(row => props.spec.kind === 'pie'
  ? `${row[props.spec.labelField] ?? ''}: ${row[props.spec.valueField] ?? 0}`
  : `${row[props.spec.xField] ?? ''}: ${row[props.spec.yField] ?? 0}`))

function render() { if (chart) chart.setOption(buildChartOption(props.spec), { notMerge: true }) }
onMounted(async () => {
  if (!root.value || !canvasAvailable) return
  const target = root.value
  const [charts, components, core, renderers] = await Promise.all([
    import('echarts/charts'), import('echarts/components'), import('echarts/core'), import('echarts/renderers'),
  ])
  if (disposed || root.value !== target) return
  core.use([
    charts.BarChart, charts.LineChart, charts.PieChart,
    components.GridComponent, components.LegendComponent, components.TitleComponent, components.TooltipComponent,
    renderers.CanvasRenderer,
  ])
  chart = core.init(target)
  render()
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(target)
})
watch(() => props.spec, render, { deep: true })
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); chart?.dispose(); observer = null; chart = null })
</script>

<template>
  <div ref="root" class="echart-view" role="img" :aria-label="spec.title || t('a2ui.chart')">
    <template v-if="!canvasAvailable"><strong>{{ spec.title }}</strong><span v-for="row in fallbackRows" :key="row">{{ row }}</span></template>
  </div>
</template>

<style scoped>
.echart-view { width: 100%; min-height: 20rem; }
.echart-view > span { display: block; }
</style>
