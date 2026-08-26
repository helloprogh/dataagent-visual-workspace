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
  <section class="gen-tool-status" :class="status">
    <header>
      <span class="gen-tool-status__icon" aria-hidden="true">›_</span>
      <b>{{ name }}</b>
      <span class="gen-tool-status__state"><i></i>{{ statusLabel }}</span>
    </header>

    <code v-if="command" class="gen-tool-status__command">{{ command }}</code>

    <details v-if="parameterText" class="gen-tool-status__section">
      <summary>调用参数</summary>
      <pre>{{ parameterText }}</pre>
    </details>

    <details v-if="resultText" class="gen-tool-status__section gen-tool-status__result" open>
      <summary>执行结果</summary>
      <pre>{{ resultText }}</pre>
    </details>

    <p v-else-if="status === 'executing'" class="gen-tool-status__hint">工具正在执行，等待 AG-UI 返回调用结果…</p>
    <p v-else-if="status === 'inProgress'" class="gen-tool-status__hint">正在接收工具调用参数…</p>
  </section>
</template>

<style scoped>
.gen-tool-status{margin:9px 0;padding:10px 11px;border:1px solid var(--da-border);border-radius:10px;background:linear-gradient(145deg,var(--da-surface-2),var(--da-surface-1));color:var(--da-text-primary)}
.gen-tool-status header{display:flex;align-items:center;gap:9px}
.gen-tool-status header>b{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:650;color:var(--da-text-primary)}
.gen-tool-status__icon{display:grid;place-items:center;width:25px;height:25px;flex:none;border:1px solid color-mix(in srgb,var(--da-accent-blue) 28%,transparent);border-radius:7px;background:color-mix(in srgb,var(--da-accent-blue) 9%,transparent);color:#B7C4EA;font:700 11px ui-monospace,SFMono-Regular,Consolas,monospace}
.gen-tool-status__state{display:inline-flex;align-items:center;gap:5px;flex:none;color:var(--da-text-muted);font-size:11px}
.gen-tool-status__state i{width:6px;height:6px;border-radius:50%;background:var(--da-accent-blue);box-shadow:0 0 8px color-mix(in srgb,var(--da-accent-blue) 60%,transparent)}
.gen-tool-status.complete .gen-tool-status__state{color:var(--da-accent-green)}
.gen-tool-status.complete .gen-tool-status__state i{background:var(--da-accent-green);box-shadow:none}
.gen-tool-status.inProgress .gen-tool-status__state i,.gen-tool-status.executing .gen-tool-status__state i{animation:tool-pulse 1.2s ease-in-out infinite}
.gen-tool-status__command{display:block;margin-top:9px;padding:8px 9px;overflow:auto;border:1px solid var(--da-border);border-radius:7px;background:var(--da-surface-code);color:var(--da-text-primary);font:11.5px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
.gen-tool-status__section{margin-top:7px;border-top:1px solid var(--da-border);padding-top:7px}
.gen-tool-status__section summary{color:var(--da-text-muted);font-size:11px;cursor:pointer;user-select:none}
.gen-tool-status__section pre{max-height:180px;margin:7px 0 0;padding:8px 9px;overflow:auto;border-radius:7px;background:var(--da-surface-code);color:var(--da-text-secondary);font:11.5px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
.gen-tool-status__result pre{color:#CDE8D9}
.gen-tool-status__hint{margin:8px 0 0;color:var(--da-text-muted);font-size:11.5px}
@keyframes tool-pulse{0%,100%{opacity:.4;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
</style>
