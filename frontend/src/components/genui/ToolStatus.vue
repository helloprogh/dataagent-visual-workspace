<script setup lang="ts">
import { computed } from 'vue'

type ToolStatus = 'inProgress' | 'executing' | 'complete'

const props = defineProps<{
  name: string
  status: ToolStatus
  parameters?: Record<string, unknown>
  result?: unknown
}>()

const statusLabel = computed(() => ({
  inProgress: '准备中',
  executing: '执行中',
  complete: '已完成',
})[props.status])

const command = computed(() => {
  const value = props.parameters?.command
  return typeof value === 'string' ? value : ''
})

function formatValue(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const parameterText = computed(() => {
  if (!props.parameters) return ''
  const parameters = Object.fromEntries(
    Object.entries(props.parameters).filter(([key]) => key !== 'command'),
  )
  return Object.keys(parameters).length ? formatValue(parameters) : ''
})

const resultText = computed(() => formatValue(props.result))
</script>

<template>
  <section class="tool-call" :class="status">
    <header>
      <span class="tool-call-icon" aria-hidden="true">›_</span>
      <b>{{ name }}</b>
      <span class="tool-call-state"><i></i>{{ statusLabel }}</span>
    </header>

    <code v-if="command" class="tool-command">{{ command }}</code>

    <details v-if="parameterText" class="tool-section">
      <summary>调用参数</summary>
      <pre>{{ parameterText }}</pre>
    </details>

    <details v-if="resultText" class="tool-section tool-result" open>
      <summary>执行结果</summary>
      <pre>{{ resultText }}</pre>
    </details>

    <p v-else-if="status === 'executing'" class="tool-hint">工具正在执行，等待 AG-UI 返回调用结果…</p>
    <p v-else-if="status === 'inProgress'" class="tool-hint">正在接收工具调用参数…</p>
  </section>
</template>

<style scoped>
.tool-call{margin:9px 0;padding:10px 11px;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:rgba(255,255,255,.028);color:#d9dde6}.tool-call header{display:flex;align-items:center;gap:9px}.tool-call header>b{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;font-weight:650}.tool-call-icon{display:grid;place-items:center;width:25px;height:25px;flex:none;border:1px solid rgba(133,153,255,.24);border-radius:7px;background:rgba(133,153,255,.09);color:#aeb9ff;font:700 10px ui-monospace,SFMono-Regular,Consolas,monospace}.tool-call-state{display:inline-flex;align-items:center;gap:5px;flex:none;color:#929bad;font-size:8px}.tool-call-state i{width:6px;height:6px;border-radius:50%;background:#7188ff;box-shadow:0 0 8px rgba(113,136,255,.6)}.tool-call.complete .tool-call-state{color:#86c9a8}.tool-call.complete .tool-call-state i{background:#58bd8a;box-shadow:none}.tool-call.inProgress .tool-call-state i,.tool-call.executing .tool-call-state i{animation:tool-pulse 1.2s ease-in-out infinite}.tool-command{display:block;margin-top:9px;padding:8px 9px;overflow:auto;border:1px solid rgba(255,255,255,.06);border-radius:7px;background:#0b0e14;color:#cbd2df;font:9px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}.tool-section{margin-top:7px;border-top:1px solid rgba(255,255,255,.055);padding-top:7px}.tool-section summary{color:#7e889a;font-size:8px;cursor:pointer;user-select:none}.tool-section pre{max-height:180px;margin:7px 0 0;padding:8px 9px;overflow:auto;border-radius:7px;background:#0b0e14;color:#aeb8c8;font:8.5px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}.tool-result pre{color:#b9c5b9}.tool-hint{margin:8px 0 0;color:#778195;font-size:8.5px}@keyframes tool-pulse{0%,100%{opacity:.4;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
</style>
