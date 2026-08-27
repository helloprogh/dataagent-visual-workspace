<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Interrupt } from '@ag-ui/client'

type ResolveInterrupt = (payload?: unknown, interruptId?: string) => Promise<unknown>
type CancelInterrupt = (interruptId?: string) => Promise<unknown>
type JsonSchema = Record<string, any>
type Field = { name: string; schema: JsonSchema; required: boolean }
type Choice = { value: any; label: string }

const props = defineProps<{
  interrupt: Interrupt | null
  interrupts: Interrupt[]
  resolve: ResolveInterrupt
  cancel: CancelInterrupt
}>()

const answers = reactive<Record<string, Record<string, any>>>({})
const rootAnswers = reactive<Record<string, any>>({})
const submittedIds = ref<string[]>([])
const busyIds = ref<string[]>([])
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
  const reason = primaryInterrupt.value?.reason
  return reason === 'input_required' ? '等待填写' : '等待确认'
})

watch(activeInterrupts, interrupts => {
  const ids = new Set(interrupts.map(item => item.id))
  submittedIds.value = submittedIds.value.filter(id => ids.has(id))
  busyIds.value = busyIds.value.filter(id => ids.has(id))
  for (const interrupt of interrupts) {
    if (!answers[interrupt.id]) answers[interrupt.id] = {}
    for (const field of fieldsFor(interrupt)) {
      if (answers[interrupt.id][field.name] === undefined && field.schema.default !== undefined) {
        answers[interrupt.id][field.name] = field.schema.default
      }
    }
    const schema = schemaFor(interrupt)
    if (rootAnswers[interrupt.id] === undefined && schema.default !== undefined) rootAnswers[interrupt.id] = schema.default
  }
  error.value = ''
}, { immediate: true, deep: true })

function schemaFor(interrupt: Interrupt): JsonSchema {
  return (interrupt.responseSchema ?? {}) as JsonSchema
}

function fieldsFor(interrupt: Interrupt): Field[] {
  const schema = schemaFor(interrupt)
  if (schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') return []
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : [])
  return Object.entries(schema.properties).map(([name, fieldSchema]) => ({
    name,
    schema: (fieldSchema ?? {}) as JsonSchema,
    required: required.has(name),
  }))
}

function fallbackChoiceLabel(value: any) {
  if (typeof value !== 'string') return JSON.stringify(value)
  const normalized = value.trim().toLowerCase()
  if (/^(once|allow[_-]?once)$/.test(normalized)) return '允许一次'
  if (/^(always|allow[_-]?always)$/.test(normalized)) return '始终允许'
  if (/^(reject|deny)$/.test(normalized)) return '拒绝'
  if (/^(approve|allow|accept|yes)$/.test(normalized)) return '允许'
  if (/^(cancel|abort|no)$/.test(normalized)) return '取消'
  return value
}

function choicesFor(schema: JsonSchema): Choice[] {
  if (Array.isArray(schema.oneOf)) {
    const choices = schema.oneOf
      .filter((item: any) => item && Object.prototype.hasOwnProperty.call(item, 'const'))
      .map((item: any) => ({ value: item.const, label: String(item.title ?? fallbackChoiceLabel(item.const)) }))
    if (choices.length) return choices
  }
  if (!Array.isArray(schema.enum)) return []
  const labels = Array.isArray(schema['x-enumNames'])
    ? schema['x-enumNames']
    : Array.isArray(schema.enumNames)
      ? schema.enumNames
      : []
  return schema.enum.map((value: any, index: number) => ({
    value,
    label: String(labels[index] ?? fallbackChoiceLabel(value)),
  }))
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
  const metadata = interrupt.metadata as { resources?: unknown } | undefined
  const resources = metadata?.resources
  if (Array.isArray(resources)) return resources.map(String).join(' · ')
  if (resources != null) return String(resources)
  return ''
}

function isBusy(id: string) {
  return busyIds.value.includes(id)
}

function isSubmitted(id: string) {
  return submittedIds.value.includes(id)
}

function setBusy(id: string, busy: boolean) {
  busyIds.value = busy
    ? [...new Set([...busyIds.value, id])]
    : busyIds.value.filter(item => item !== id)
}

function payloadFor(interrupt: Interrupt) {
  const schema = schemaFor(interrupt)
  if (schema.type === 'object' || fieldsFor(interrupt).length) return { ...(answers[interrupt.id] ?? {}) }
  return rootAnswers[interrupt.id]
}

function isComplete(interrupt: Interrupt) {
  const fields = fieldsFor(interrupt)
  if (!fields.length) {
    const schema = schemaFor(interrupt)
    if (choicesFor(schema).length || schema.type === 'boolean') return rootAnswers[interrupt.id] !== undefined
    return true
  }
  return fields.every(field => !field.required || (
    answers[interrupt.id]?.[field.name] !== undefined
    && answers[interrupt.id]?.[field.name] !== ''
  ))
}

function needsSubmit(interrupt: Interrupt) {
  const fields = fieldsFor(interrupt)
  if (fields.length > 1) return true
  if (fields.length === 1) {
    const schema = fields[0].schema
    return !choicesFor(schema).length && schema.type !== 'boolean'
  }
  const schema = schemaFor(interrupt)
  return !choicesFor(schema).length && schema.type !== 'boolean'
}

function normalizeInputValue(schema: JsonSchema, value: string) {
  if (schema.type === 'number' || schema.type === 'integer') {
    if (value === '') return ''
    const numeric = Number(value)
    return Number.isNaN(numeric) ? value : numeric
  }
  return value
}

function setFieldInput(interrupt: Interrupt, field: Field, event: Event) {
  const value = (event.target as HTMLInputElement).value
  answers[interrupt.id][field.name] = normalizeInputValue(field.schema, value)
}

function setRootInput(interrupt: Interrupt, event: Event) {
  const value = (event.target as HTMLInputElement).value
  rootAnswers[interrupt.id] = normalizeInputValue(schemaFor(interrupt), value)
}

async function submit(interrupt: Interrupt) {
  if (isBusy(interrupt.id) || isSubmitted(interrupt.id) || !isComplete(interrupt)) return
  error.value = ''
  setBusy(interrupt.id, true)
  try {
    await props.resolve(payloadFor(interrupt), interrupt.id)
    submittedIds.value = [...new Set([...submittedIds.value, interrupt.id])]
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    setBusy(interrupt.id, false)
  }
}

async function cancel(interrupt: Interrupt) {
  if (isBusy(interrupt.id) || isSubmitted(interrupt.id)) return
  error.value = ''
  setBusy(interrupt.id, true)
  try {
    await props.cancel(interrupt.id)
    submittedIds.value = [...new Set([...submittedIds.value, interrupt.id])]
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    setBusy(interrupt.id, false)
  }
}

async function chooseField(interrupt: Interrupt, field: Field, value: any) {
  answers[interrupt.id][field.name] = value
  if (fieldsFor(interrupt).length === 1) await submit(interrupt)
}

async function chooseRoot(interrupt: Interrupt, value: any) {
  rootAnswers[interrupt.id] = value
  await submit(interrupt)
}
</script>

<template>
  <section v-if="activeInterrupts.length" class="approval-request" role="alert" aria-live="polite">
    <header class="approval-request__header">
      <span class="approval-request__icon" aria-hidden="true">!</span>
      <div class="approval-request__heading">
        <b>{{ requestTitle }}</b>
        <span v-if="activeInterrupts.length > 1">{{ activeInterrupts.length }} 项待处理</span>
      </div>
      <span class="approval-request__state"><i></i>{{ requestStatus }}</span>
    </header>

    <div class="approval-request__list">
      <article v-for="item in activeInterrupts" :key="item.id" :class="{ submitted: isSubmitted(item.id) }">
        <div class="approval-request__copy">
          <b>{{ titleFor(item) }}</b>
          <p>{{ messageFor(item) }}</p>
          <code v-if="resourceFor(item)">{{ resourceFor(item) }}</code>
        </div>

        <div v-if="!isSubmitted(item.id)" class="approval-request__response">
          <template v-if="fieldsFor(item).length">
            <label v-for="field in fieldsFor(item)" :key="field.name" class="approval-request__field">
              <span>{{ field.schema.title || field.name }}<em v-if="field.required">*</em></span>

              <div v-if="choicesFor(field.schema).length" class="approval-request__choices">
                <button
                  v-for="choice in choicesFor(field.schema)"
                  :key="JSON.stringify(choice.value)"
                  type="button"
                  :disabled="isBusy(item.id)"
                  :class="{ selected: answers[item.id]?.[field.name] === choice.value }"
                  @click="chooseField(item, field, choice.value)"
                >{{ choice.label }}</button>
              </div>

              <div v-else-if="field.schema.type === 'boolean'" class="approval-request__choices">
                <button type="button" :disabled="isBusy(item.id)" :class="{ selected: answers[item.id]?.[field.name] === true }" @click="chooseField(item, field, true)">是</button>
                <button type="button" :disabled="isBusy(item.id)" :class="{ selected: answers[item.id]?.[field.name] === false }" @click="chooseField(item, field, false)">否</button>
              </div>

              <input
                v-else
                :value="answers[item.id]?.[field.name] ?? ''"
                :type="field.schema.type === 'number' || field.schema.type === 'integer' ? 'number' : 'text'"
                :placeholder="field.schema.description || field.schema.title || field.name"
                :disabled="isBusy(item.id)"
                @input="setFieldInput(item, field, $event)"
              />
            </label>
          </template>

          <template v-else-if="choicesFor(schemaFor(item)).length">
            <div class="approval-request__choices">
              <button
                v-for="choice in choicesFor(schemaFor(item))"
                :key="JSON.stringify(choice.value)"
                type="button"
                :disabled="isBusy(item.id)"
                :class="{ selected: rootAnswers[item.id] === choice.value }"
                @click="chooseRoot(item, choice.value)"
              >{{ choice.label }}</button>
            </div>
          </template>

          <template v-else-if="schemaFor(item).type === 'boolean'">
            <div class="approval-request__choices">
              <button type="button" :disabled="isBusy(item.id)" :class="{ selected: rootAnswers[item.id] === true }" @click="chooseRoot(item, true)">是</button>
              <button type="button" :disabled="isBusy(item.id)" :class="{ selected: rootAnswers[item.id] === false }" @click="chooseRoot(item, false)">否</button>
            </div>
          </template>

          <input
            v-else-if="schemaFor(item).type === 'string' || schemaFor(item).type === 'number' || schemaFor(item).type === 'integer'"
            :value="rootAnswers[item.id] ?? ''"
            :type="schemaFor(item).type === 'number' || schemaFor(item).type === 'integer' ? 'number' : 'text'"
            :placeholder="schemaFor(item).description || schemaFor(item).title || '请输入内容'"
            :disabled="isBusy(item.id)"
            @input="setRootInput(item, $event)"
          />

          <div class="approval-request__footer">
            <button
              v-if="needsSubmit(item)"
              type="button"
              class="primary"
              :disabled="isBusy(item.id) || !isComplete(item)"
              @click="submit(item)"
            >确认</button>
            <button type="button" class="cancel" :disabled="isBusy(item.id)" @click="cancel(item)">取消</button>
          </div>
        </div>

        <small v-else>已处理，等待其他待处理项完成。</small>
      </article>
    </div>

    <p v-if="error" class="approval-request__error">处理失败：{{ error }}</p>
  </section>
</template>

<style scoped>
.approval-request{margin:9px 0;padding:10px 11px;border:1px solid var(--da-border);border-radius:10px;background:linear-gradient(145deg,var(--da-surface-2),var(--da-surface-1));color:var(--da-text-primary)}
.approval-request__header{display:flex;align-items:center;gap:9px}.approval-request__icon{display:grid;place-items:center;width:25px;height:25px;flex:none;border:1px solid color-mix(in srgb,var(--da-accent-yellow) 30%,transparent);border-radius:7px;background:color-mix(in srgb,var(--da-accent-yellow) 9%,transparent);color:#E7D7A2;font:750 12px/1 ui-sans-serif,system-ui,sans-serif}.approval-request__heading{min-width:0;flex:1;display:flex;align-items:baseline;gap:8px}.approval-request__heading b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--da-text-primary);font-size:12.5px;font-weight:650}.approval-request__heading>span{color:var(--da-text-muted);font-size:10.5px}.approval-request__state{display:inline-flex;align-items:center;gap:5px;flex:none;color:var(--da-text-muted);font-size:11px}.approval-request__state i{width:6px;height:6px;border-radius:50%;background:var(--da-accent-yellow);box-shadow:0 0 8px color-mix(in srgb,var(--da-accent-yellow) 55%,transparent);animation:approval-pulse 1.2s ease-in-out infinite}
.approval-request__list{display:flex;flex-direction:column;margin-top:9px;border-top:1px solid var(--da-border)}.approval-request__list article{padding:9px 0 1px}.approval-request__list article+article{margin-top:8px;border-top:1px solid var(--da-border);padding-top:9px}.approval-request__list article.submitted{opacity:.68}
.approval-request__copy{display:flex;flex-direction:column;gap:4px}.approval-request__copy b{color:var(--da-text-primary);font-size:12px;font-weight:620}.approval-request__copy p{margin:0;color:var(--da-text-secondary);font-size:11.5px;line-height:1.55}.approval-request__copy code{display:block;margin-top:3px;padding:7px 8px;overflow:auto;border:1px solid var(--da-border);border-radius:7px;background:var(--da-surface-code);color:var(--da-text-secondary);font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
.approval-request__response{display:flex;flex-direction:column;gap:9px;margin-top:9px}.approval-request__field{display:flex;flex-direction:column;gap:6px}.approval-request__field>span{color:var(--da-text-muted);font-size:11px}.approval-request__field em{margin-left:3px;color:var(--da-accent-red);font-style:normal}
.approval-request__choices{display:flex;flex-wrap:wrap;gap:7px}.approval-request__choices button,.approval-request__footer button{min-height:30px;padding:6px 10px;border:1px solid var(--da-border-strong);border-radius:7px;background:rgba(255,255,255,.025);color:var(--da-text-primary);font-size:11px;cursor:pointer;transition:border-color .16s ease,background .16s ease,color .16s ease}.approval-request__choices button:hover,.approval-request__choices button.selected,.approval-request__footer button.primary:hover{border-color:color-mix(in srgb,var(--da-accent-yellow) 70%,var(--da-border));background:color-mix(in srgb,var(--da-accent-yellow) 14%,transparent);color:var(--da-text-emphasis)}
.approval-request__response input{height:32px;padding:0 9px;border:1px solid var(--da-border);border-radius:7px;outline:none;background:var(--da-surface-input);color:var(--da-text-primary);font:inherit;font-size:11.5px}.approval-request__response input:focus{border-color:color-mix(in srgb,var(--da-accent-yellow) 68%,var(--da-border))}
.approval-request__footer{display:flex;justify-content:flex-end;gap:7px}.approval-request__footer button.primary{border-color:color-mix(in srgb,var(--da-accent-yellow) 42%,var(--da-border));background:color-mix(in srgb,var(--da-accent-yellow) 8%,transparent)}.approval-request__footer button.cancel{border-color:var(--da-border);background:transparent;color:var(--da-text-muted)}.approval-request__footer button.cancel:hover{border-color:var(--da-border-strong);color:var(--da-text-primary)}
.approval-request__choices button:disabled,.approval-request__footer button:disabled,.approval-request__response input:disabled{opacity:.5;cursor:wait}.approval-request__list small{display:block;margin-top:7px;color:var(--da-text-muted);font-size:10.5px}.approval-request__error{margin:8px 0 0;color:#FFB0BC;font-size:10.5px}
@keyframes approval-pulse{0%,100%{opacity:.45;transform:scale(.82)}50%{opacity:1;transform:scale(1)}}
@media(max-width:540px){.approval-request__heading>span{display:none}.approval-request__footer{justify-content:flex-start;flex-wrap:wrap}}
</style>
