<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { isInterruptExpired, type Interrupt } from '@ag-ui/client'
import AguiSchemaField from './AguiSchemaField.vue'
import {
  defaultValueForSchema,
  normalizeSchema,
  prettyJson,
  validateSchemaValue,
  type JsonSchema,
} from './agui-response-schema'

type ResolveInterrupt = (payload?: unknown, interruptId?: string) => Promise<unknown>
type CancelInterrupt = (interruptId?: string) => Promise<unknown>

const props = defineProps<{
  interrupt: Interrupt | null
  interrupts: Interrupt[]
  resolve: ResolveInterrupt
  cancel: CancelInterrupt
}>()

const answers = reactive<Record<string, any>>({})
const cancelledIds = ref<string[]>([])
const advancedIds = ref<string[]>([])
const rawDrafts = reactive<Record<string, string>>({})
const rawErrors = reactive<Record<string, string>>({})
const submitting = ref(false)
const error = ref('')

const activeInterrupts = computed(() => props.interrupts.length ? props.interrupts : (props.interrupt ? [props.interrupt] : []))
const primaryInterrupt = computed(() => activeInterrupts.value[0] ?? null)
const requestTitle = computed(() => {
  const reason = primaryInterrupt.value?.reason
  if (reason === 'tool_call') return '操作确认'
  if (reason === 'confirmation') return '请确认'
  if (reason === 'input_required') return '需要补充信息'
  return '需要你的处理'
})
const requestStatus = computed(() => {
  if (activeInterrupts.value.some(isExpired)) return '已过期'
  return primaryInterrupt.value?.reason === 'input_required' ? '等待填写' : '等待确认'
})
const allComplete = computed(() => activeInterrupts.value.length > 0 && activeInterrupts.value.every(isComplete))

watch(activeInterrupts, interrupts => {
  const ids = new Set(interrupts.map(item => item.id))
  cancelledIds.value = cancelledIds.value.filter(id => ids.has(id))
  advancedIds.value = advancedIds.value.filter(id => ids.has(id))

  for (const interrupt of interrupts) {
    if (!Object.prototype.hasOwnProperty.call(answers, interrupt.id)) {
      const initial = defaultValueForSchema(schemaFor(interrupt))
      if (initial !== undefined) answers[interrupt.id] = initial
    }
    rawDrafts[interrupt.id] = prettyJson(answers[interrupt.id])
    rawErrors[interrupt.id] = ''
  }
  error.value = ''
}, { immediate: true, deep: true })

function schemaFor(interrupt: Interrupt): JsonSchema {
  return normalizeSchema((interrupt.responseSchema ?? {}) as JsonSchema)
}

function hasResponseSchema(interrupt: Interrupt) {
  return !!interrupt.responseSchema && Object.keys(interrupt.responseSchema as Record<string, unknown>).length > 0
}

function titleFor(interrupt: Interrupt) {
  const metadata = interrupt.metadata as { action?: unknown } | undefined
  if (metadata?.action) return String(metadata.action)
  if (interrupt.reason === 'tool_call') return '执行操作'
  if (interrupt.reason === 'input_required') return '补充信息'
  if (interrupt.reason === 'confirmation') return '确认操作'
  return '继续处理'
}

function messageFor(interrupt: Interrupt) {
  if (interrupt.message) return interrupt.message
  if (interrupt.reason === 'tool_call') return '即将执行以下操作，请确认是否继续。'
  if (interrupt.reason === 'input_required') return '需要补充以下信息后才能继续。'
  if (interrupt.reason === 'confirmation') return '请确认是否继续。'
  return '需要你的输入后才能继续处理。'
}

function resourceFor(interrupt: Interrupt) {
  const resources = (interrupt.metadata as { resources?: unknown } | undefined)?.resources
  if (Array.isArray(resources)) return resources.map(String).join(' · ')
  if (resources != null) return String(resources)
  return ''
}

function isExpired(interrupt: Interrupt) {
  return isInterruptExpired(interrupt)
}

function expiryFor(interrupt: Interrupt) {
  if (!interrupt.expiresAt) return ''
  const date = new Date(interrupt.expiresAt)
  if (Number.isNaN(date.getTime())) return interrupt.expiresAt
  return `有效期至 ${date.toLocaleString()}`
}

function isCancelled(id: string) { return cancelledIds.value.includes(id) }
function isAdvanced(id: string) { return advancedIds.value.includes(id) }

function setCancelled(id: string, cancelled: boolean) {
  cancelledIds.value = cancelled
    ? [...new Set([...cancelledIds.value, id])]
    : cancelledIds.value.filter(item => item !== id)
}

function setAnswer(interrupt: Interrupt, value: any) {
  answers[interrupt.id] = value
  rawDrafts[interrupt.id] = prettyJson(value)
  rawErrors[interrupt.id] = ''
  setCancelled(interrupt.id, false)
}

function validationErrors(interrupt: Interrupt) {
  if (isCancelled(interrupt.id) || !hasResponseSchema(interrupt)) return []
  return validateSchemaValue(schemaFor(interrupt), answers[interrupt.id])
}

function isComplete(interrupt: Interrupt) {
  if (isExpired(interrupt)) return false
  if (isCancelled(interrupt.id)) return true
  if (!hasResponseSchema(interrupt)) return true
  return validationErrors(interrupt).length === 0
}

function toggleAdvanced(interrupt: Interrupt) {
  if (isAdvanced(interrupt.id)) {
    advancedIds.value = advancedIds.value.filter(id => id !== interrupt.id)
    return
  }
  rawDrafts[interrupt.id] = prettyJson(answers[interrupt.id])
  rawErrors[interrupt.id] = ''
  advancedIds.value = [...new Set([...advancedIds.value, interrupt.id])]
}

function applyRaw(interrupt: Interrupt) {
  rawErrors[interrupt.id] = ''
  try {
    const source = rawDrafts[interrupt.id]?.trim() ?? ''
    setAnswer(interrupt, source === '' ? undefined : JSON.parse(source))
  } catch (reason) {
    rawErrors[interrupt.id] = reason instanceof Error ? reason.message : String(reason)
  }
}

async function submitAll() {
  if (submitting.value || !allComplete.value) return
  const expired = activeInterrupts.value.find(isExpired)
  if (expired) {
    error.value = `请求已过期，无法继续：${messageFor(expired)}`
    return
  }

  error.value = ''
  submitting.value = true
  try {
    // AG-UI requires one resume request to cover every open interrupt. CopilotKit's
    // native useInterrupt accumulates these per-id responses and emits the actual
    // run only when the final open interrupt is addressed.
    for (const interrupt of activeInterrupts.value) {
      if (isCancelled(interrupt.id)) await props.cancel(interrupt.id)
      else await props.resolve(answers[interrupt.id], interrupt.id)
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section v-if="activeInterrupts.length" class="approval-request" role="alert" aria-live="polite">
    <header class="approval-request__header">
      <span class="approval-request__icon" aria-hidden="true">?</span>
      <div class="approval-request__heading">
        <b>{{ requestTitle }}</b>
        <span v-if="activeInterrupts.length > 1">{{ activeInterrupts.length }} 项待处理</span>
      </div>
      <span class="approval-request__state" :class="{ expired: activeInterrupts.some(isExpired) }"><i></i>{{ requestStatus }}</span>
    </header>

    <div class="approval-request__list">
      <article
        v-for="item in activeInterrupts"
        :key="item.id"
        class="approval-request__item"
        :class="{ cancelled: isCancelled(item.id), expired: isExpired(item) }"
      >
        <div class="approval-request__copy">
          <div class="approval-request__title-row">
            <b>{{ titleFor(item) }}</b>
            <span v-if="item.subagentRunId" class="approval-request__tag">子任务请求</span>
          </div>
          <p>{{ messageFor(item) }}</p>
          <code v-if="resourceFor(item)">{{ resourceFor(item) }}</code>
          <small v-if="expiryFor(item)" class="approval-request__expiry">{{ expiryFor(item) }}</small>
        </div>

        <div v-if="!isExpired(item)" class="approval-request__response">
          <div class="approval-request__decision">
            <button
              type="button"
              :disabled="submitting"
              :class="{ selected: !isCancelled(item.id) }"
              @click="setCancelled(item.id, false)"
            >提供响应</button>
            <button
              type="button"
              :disabled="submitting"
              :class="{ selected: isCancelled(item.id) }"
              @click="setCancelled(item.id, true)"
            >取消此项</button>
          </div>

          <template v-if="!isCancelled(item.id)">
            <AguiSchemaField
              v-if="hasResponseSchema(item) && !isAdvanced(item.id)"
              :schema="schemaFor(item)"
              :model-value="answers[item.id]"
              :disabled="submitting"
              @update:model-value="setAnswer(item, $event)"
            />

            <div v-else-if="!hasResponseSchema(item)" class="approval-request__no-schema">
              此请求未声明响应结构。确认后将按协议提交 resolved 状态，不附加 payload。
            </div>

            <div v-else class="approval-request__raw">
              <textarea v-model="rawDrafts[item.id]" :disabled="submitting" rows="7" spellcheck="false" aria-label="高级 JSON 响应"></textarea>
              <div class="approval-request__raw-actions">
                <button type="button" :disabled="submitting" @click="applyRaw(item)">应用 JSON</button>
              </div>
              <small v-if="rawErrors[item.id]" class="approval-request__field-error">JSON 解析失败：{{ rawErrors[item.id] }}</small>
            </div>

            <div v-if="hasResponseSchema(item)" class="approval-request__advanced-row">
              <button type="button" :disabled="submitting" @click="toggleAdvanced(item)">
                {{ isAdvanced(item.id) ? '返回表单' : '高级 JSON' }}
              </button>
            </div>

            <ul v-if="validationErrors(item).length" class="approval-request__validation">
              <li v-for="message in validationErrors(item).slice(0, 5)" :key="message">{{ message }}</li>
            </ul>
          </template>

          <div v-else class="approval-request__cancelled-note">该项将以 AG-UI `cancelled` 状态提交，不包含 payload。</div>
        </div>

        <div v-else class="approval-request__expired-note">该请求已经过期。根据 AG-UI 规范，客户端不会提交过期的 resume。</div>
      </article>
    </div>

    <footer class="approval-request__footer">
      <span v-if="activeInterrupts.length > 1">将一次性提交全部 {{ activeInterrupts.length }} 项处理结果</span>
      <button type="button" class="primary" :disabled="submitting || !allComplete" @click="submitAll">
        {{ submitting ? '提交中…' : '提交并继续' }}
      </button>
    </footer>

    <p v-if="error" class="approval-request__error">处理失败：{{ error }}</p>
  </section>
</template>

<style scoped>
.approval-request{position:relative;width:100%;min-width:0;margin:10px 0 14px;overflow:hidden;box-sizing:border-box;border:1px solid var(--da-border-strong);border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--da-surface-2) 97%,transparent),var(--da-surface-1));box-shadow:inset 3px 0 color-mix(in srgb,var(--da-accent-yellow) 52%,transparent),0 10px 28px rgba(0,0,0,.12);color:var(--da-text-primary)}
.approval-request__header{min-width:0;min-height:48px;padding:0 12px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--da-border);background:linear-gradient(90deg,color-mix(in srgb,var(--da-accent-yellow) 4%,transparent),transparent 58%)}
.approval-request__icon{width:28px;height:28px;flex:0 0 28px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--da-accent-yellow) 28%,transparent);border-radius:8px;background:color-mix(in srgb,var(--da-accent-yellow) 6%,transparent);color:#E6D49A;font:700 12px/1 ui-sans-serif,system-ui,sans-serif}
.approval-request__heading{min-width:0;flex:1;display:flex;align-items:baseline;gap:8px}.approval-request__heading b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--da-text-primary);font-size:14px!important;font-weight:640}.approval-request__heading>span{flex:none;color:var(--da-text-muted);font-size:12px!important}
.approval-request__state{display:inline-flex;align-items:center;gap:6px;flex:none;color:var(--da-text-muted);font-size:12px!important;white-space:nowrap}.approval-request__state i{width:5px;height:5px;border-radius:50%;background:var(--da-accent-yellow);animation:approval-pulse 1.2s ease-in-out infinite}.approval-request__state.expired{color:#F1A1AE}.approval-request__state.expired i{background:var(--da-accent-red);animation:none}
.approval-request__list{min-width:0;display:flex;flex-direction:column}.approval-request__item{min-width:0;padding:13px}.approval-request__item+.approval-request__item{border-top:1px solid var(--da-border)}.approval-request__item.cancelled{background:color-mix(in srgb,var(--da-surface-deep) 28%,transparent)}.approval-request__item.expired{opacity:.72}
.approval-request__copy{min-width:0;display:flex;flex-direction:column;gap:5px}.approval-request__title-row{display:flex;align-items:center;gap:8px}.approval-request__copy b{color:var(--da-text-primary);font-size:14px!important;font-weight:620}.approval-request__tag{padding:2px 6px;border:1px solid var(--da-border);border-radius:999px;color:var(--da-text-muted);font-size:10px}.approval-request__copy p{margin:0;color:var(--da-text-secondary);font-size:14px!important;line-height:1.55}.approval-request__copy code{display:block;max-width:100%;margin-top:5px;padding:8px 9px;overflow:auto;box-sizing:border-box;border:1px solid var(--da-border);border-radius:8px;background:var(--da-surface-code);color:var(--da-text-secondary);font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}.approval-request__expiry{color:var(--da-text-muted);font-size:11px}
.approval-request__response{width:100%;min-width:0;display:flex;flex-direction:column;gap:10px;margin-top:12px}.approval-request__decision{display:flex;flex-wrap:wrap;gap:7px;padding-bottom:9px;border-bottom:1px solid color-mix(in srgb,var(--da-border) 75%,transparent)}
.approval-request__decision button,.approval-request__advanced-row button,.approval-request__raw-actions button,.approval-request__footer button{min-height:34px;padding:0 12px;border:1px solid var(--da-border);border-radius:8px;background:var(--da-surface-3);color:var(--da-text-primary);font:580 12px/1 inherit;cursor:pointer;transition:border-color .15s ease,background .15s ease,color .15s ease}.approval-request__decision button:hover:not(:disabled),.approval-request__advanced-row button:hover:not(:disabled),.approval-request__raw-actions button:hover:not(:disabled),.approval-request__footer button:hover:not(:disabled){border-color:var(--da-border-strong);background:var(--da-surface-4)}.approval-request__decision button.selected{border-color:color-mix(in srgb,var(--da-accent-yellow) 50%,var(--da-border));background:color-mix(in srgb,var(--da-accent-yellow) 9%,var(--da-surface-3));color:var(--da-text-emphasis)}
.approval-request__no-schema,.approval-request__cancelled-note,.approval-request__expired-note{padding:9px 10px;border:1px solid var(--da-border);border-radius:8px;background:color-mix(in srgb,var(--da-surface-deep) 45%,transparent);color:var(--da-text-muted);font-size:12px;line-height:1.5}.approval-request__expired-note{margin-top:11px;color:#E9A5AF}
.approval-request__advanced-row{display:flex;justify-content:flex-end}.approval-request__advanced-row button{min-height:28px;background:transparent;color:var(--da-text-muted);font-size:11px}.approval-request__raw{display:flex;flex-direction:column;gap:7px}.approval-request__raw textarea{width:100%;min-width:0;padding:9px 10px;box-sizing:border-box;resize:vertical;border:1px solid var(--da-border);border-radius:8px;outline:none;background:var(--da-surface-input);color:var(--da-text-primary);font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}.approval-request__raw textarea:focus{border-color:color-mix(in srgb,var(--da-accent-yellow) 42%,var(--da-border));box-shadow:0 0 0 3px color-mix(in srgb,var(--da-accent-yellow) 6%,transparent)}.approval-request__raw-actions{display:flex;justify-content:flex-end}.approval-request__raw-actions button{min-height:30px}.approval-request__field-error{color:#F1A1AE;font-size:12px}
.approval-request__validation{margin:0;padding:8px 10px 8px 27px;border:1px solid color-mix(in srgb,var(--da-accent-red) 25%,var(--da-border));border-radius:8px;background:color-mix(in srgb,var(--da-accent-red) 4%,transparent);color:#F1A1AE;font-size:12px;line-height:1.5}
.approval-request__footer{width:100%;min-width:0;padding:11px 13px;display:flex;align-items:center;justify-content:flex-end;gap:10px;box-sizing:border-box;border-top:1px solid var(--da-border);background:color-mix(in srgb,var(--da-surface-deep) 28%,transparent)}.approval-request__footer>span{margin-right:auto;color:var(--da-text-muted);font-size:11px}.approval-request__footer button.primary{min-width:112px;border-color:color-mix(in srgb,var(--da-accent-yellow) 42%,var(--da-border));background:color-mix(in srgb,var(--da-accent-yellow) 10%,var(--da-surface-3));color:var(--da-text-emphasis)}.approval-request__footer button.primary:hover:not(:disabled){border-color:color-mix(in srgb,var(--da-accent-yellow) 60%,var(--da-border));background:color-mix(in srgb,var(--da-accent-yellow) 14%,var(--da-surface-3))}
button:disabled,textarea:disabled{opacity:.45;cursor:not-allowed}.approval-request__error{margin:0;padding:0 13px 12px;color:#F1A1AE;font-size:13px!important}
@keyframes approval-pulse{0%,100%{opacity:.46;transform:scale(.84)}50%{opacity:1;transform:scale(1)}}
@media(max-width:540px){.approval-request__header{padding:0 10px}.approval-request__item{padding:11px}.approval-request__heading>span,.approval-request__state{display:none}.approval-request__decision button{flex:1 1 calc(50% - 4px)}.approval-request__footer{align-items:stretch;flex-direction:column}.approval-request__footer>span{margin:0}.approval-request__footer button.primary{width:100%}}
@media(prefers-reduced-motion:reduce){.approval-request__state i{animation:none}.approval-request button,.approval-request textarea{transition:none}}
</style>
