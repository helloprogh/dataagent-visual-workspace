<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { ECharts, EChartsCoreOption } from 'echarts'

const props = withDefaults(defineProps<{
  option: EChartsCoreOption
  loading?: boolean
  autoresize?: boolean
}>(), {
  loading: false,
  autoresize: true,
})

const root = ref<HTMLDivElement | null>(null)
let chart: ECharts | null = null
let observer: ResizeObserver | null = null

function resize() {
  chart?.resize()
}

onMounted(() => {
  if (!root.value) return
  chart = echarts.init(root.value)
  chart.setOption(props.option, { notMerge: true })
  if (props.loading) chart.showLoading('default', { text: '加载中' })
  if (props.autoresize && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => resize())
    observer.observe(root.value)
  }
})

watch(() => props.option, option => chart?.setOption(option, { notMerge: false, lazyUpdate: true }), { deep: true })
watch(() => props.loading, loading => {
  if (!chart) return
  if (loading) chart.showLoading('default', { text: '加载中' })
  else chart.hideLoading()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  chart?.dispose()
  chart = null
})

defineExpose({ resize, getInstance: () => chart })
</script>

<template>
  <div ref="root" class="da-echart"></div>
</template>

<style scoped>
.da-echart{width:100%;height:100%;min-height:220px}
</style>
