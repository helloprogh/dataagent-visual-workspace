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
      <span class="gen-tool-status__icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="m5.2 6.2 3.2 3.3-3.2 3.3" />
          <path d="M10.8 13h4" />
        </svg>
      </span>
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

    <p v-else-if="status === 'executing'" class="gen-tool-status__hint">工具正在执行，等待返回结果…</p>
    <p v-else-if="status === 'inProgress'" class="gen-tool-status__hint">正在接收工具调用参数…</p>
  </section>
</template>

<style scoped>
.gen-tool-status{
  position:relative;
  width:100%;
  min-width:0;
  margin:8px 0;
  padding:8px 9px 9px;
  overflow:hidden;
  border:0;
  border-left:2px solid transparent;
  border-radius:8px;
  background:rgba(255,255,255,.006);
  box-shadow:none;
  color:var(--da-text-primary);
  transition:background .16s ease,border-color .16s ease;
}
.gen-tool-status.executing,
.gen-tool-status.inProgress{
  border-left-color:color-mix(in srgb,var(--da-accent-blue) 54%,transparent);
  background:color-mix(in srgb,var(--da-accent-blue) 2%,transparent);
}
.gen-tool-status.complete{background:rgba(255,255,255,.004)}
.gen-tool-status header{width:100%;min-width:0;display:flex;align-items:center;gap:9px;min-height:30px}
.gen-tool-status header>b{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--da-text-primary);font-size:14px!important;font-weight:610}
.gen-tool-status__icon{
  width:26px;
  height:26px;
  flex:0 0 26px;
  display:grid;
  place-items:center;
  border:0;
  border-radius:7px;
  background:rgba(255,255,255,.018);
  color:var(--da-text-subtle);
  line-height:0;
}
.gen-tool-status__icon svg{display:block;width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.gen-tool-status.executing .gen-tool-status__icon,
.gen-tool-status.inProgress .gen-tool-status__icon{color:#C0C9E8}
.gen-tool-status__state{display:inline-flex;align-items:center;gap:6px;flex:none;color:var(--da-text-subtle);font-size:12px!important;white-space:nowrap}
.gen-tool-status__state i{width:5px;height:5px;flex:0 0 5px;border-radius:50%;background:var(--da-text-subtle)}
.gen-tool-status.executing .gen-tool-status__state i,
.gen-tool-status.inProgress .gen-tool-status__state i{background:var(--da-accent-blue);animation:tool-pulse 1.2s ease-in-out infinite}
.gen-tool-status.complete .gen-tool-status__state i{background:var(--da-accent-green)}
.gen-tool-status__command{
  display:block;
  max-width:calc(100% - 35px);
  margin:8px 0 0 35px;
  padding:8px 10px;
  overflow:auto;
  border:1px solid var(--da-border);
  border-radius:7px;
  background:var(--da-surface-code);
  color:var(--da-text-secondary);
  font:13px/1.58 ui-monospace,SFMono-Regular,Consolas,monospace;
  white-space:pre-wrap;
  word-break:break-word;
}
.gen-tool-status__section{max-width:calc(100% - 35px);margin:8px 0 0 35px;padding-top:8px;border-top:1px solid color-mix(in srgb,var(--da-border) 68%,transparent)}
.gen-tool-status__section summary{width:max-content;max-width:100%;color:var(--da-text-muted);font-size:12px!important;cursor:pointer;user-select:none;transition:color .15s ease}
.gen-tool-status__section summary:hover{color:var(--da-text-primary)}
.gen-tool-status__section pre{
  max-width:100%;
  max-height:220px;
  margin:7px 0 0;
  padding:9px 10px;
  overflow:auto;
  border:1px solid var(--da-border);
  border-radius:7px;
  background:var(--da-surface-code);
  color:var(--da-text-secondary);
  font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;
  white-space:pre-wrap;
  word-break:break-word;
}
.gen-tool-status__result pre{color:var(--da-text-secondary)}
.gen-tool-status__hint{max-width:calc(100% - 35px);margin:8px 0 0 35px;color:var(--da-text-muted);font-size:13px!important;line-height:1.55}
@keyframes tool-pulse{0%,100%{opacity:.42;transform:scale(.84)}50%{opacity:1;transform:scale(1)}}
@media(max-width:540px){
  .gen-tool-status__command,.gen-tool-status__section,.gen-tool-status__hint{max-width:100%;margin-left:0}
}
@media(prefers-reduced-motion:reduce){
  .gen-tool-status{transition:none}
  .gen-tool-status__state i{animation:none!important}
  .gen-tool-status__section summary{transition:none}
}
</style>
