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

function choicesFor(schema: JsonSchema): Choice[] {
  if (Array.isArray(schema.oneOf)) {
    const choices = schema.oneOf
      .filter((item: any) => item && Object.prototype.hasOwnProperty.call(item, 'const'))
      .map((item: any) => ({ value: item.const, label: String(item.title ?? item.const) }))
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
    label: String(labels[index] ?? (typeof value === 'string' ? value : JSON.stringify(value))),
  }))
}

function titleFor(interrupt: Interrupt) {
  const metadata = interrupt.metadata as { action?: unknown } | undefined
  return metadata?.action ? String(metadata.action) : interrupt.reason
}

function resourceFor(interrupt: Interrupt) {
  const metadata = interrupt.metadata as { resources?: unknown } | undefined
  const resources = metadata?.resources
  if (Array.isArray(resources)) return resources.map(String).join(' · ')
  if (resources != null) return String(resources)
  return interrupt.toolCallId || interrupt.id
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
  <section v-if="activeInterrupts.length" class="agui-interrupt" role="alert" aria-live="assertive">
    <header>
      <div>
        <span>AG-UI · HUMAN IN THE LOOP</span>
        <b>{{ activeInterrupts.length > 1 ? `${activeInterrupts.length} 项操作等待处理` : '操作等待处理' }}</b>
      </div>
      <i>ACTION REQUIRED</i>
    </header>

    <div class="interrupt-list">
      <article v-for="item in activeInterrupts" :key="item.id" :class="{ submitted: isSubmitted(item.id) }">
        <div class="interrupt-copy">
          <b>{{ titleFor(item) }}</b>
          <p>{{ item.message || 'Agent 正在等待你的输入后继续执行。' }}</p>
          <code>{{ resourceFor(item) }}</code>
        </div>

        <div v-if="!isSubmitted(item.id)" class="interrupt-response">
          <template v-if="fieldsFor(item).length">
            <label v-for="field in fieldsFor(item)" :key="field.name" class="interrupt-field">
              <span>{{ field.schema.title || field.name }}<em v-if="field.required">*</em></span>

              <div v-if="choicesFor(field.schema).length" class="interrupt-choices">
                <button
                  v-for="choice in choicesFor(field.schema)"
                  :key="JSON.stringify(choice.value)"
                  type="button"
                  :disabled="isBusy(item.id)"
                  :class="{ selected: answers[item.id]?.[field.name] === choice.value }"
                  @click="chooseField(item, field, choice.value)"
                >{{ choice.label }}</button>
              </div>

              <div v-else-if="field.schema.type === 'boolean'" class="interrupt-choices">
                <button type="button" :disabled="isBusy(item.id)" :class="{ selected: answers[item.id]?.[field.name] === true }" @click="chooseField(item, field, true)">true</button>
                <button type="button" :disabled="isBusy(item.id)" :class="{ selected: answers[item.id]?.[field.name] === false }" @click="chooseField(item, field, false)">false</button>
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
            <div class="interrupt-choices">
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
            <div class="interrupt-choices">
              <button type="button" :disabled="isBusy(item.id)" :class="{ selected: rootAnswers[item.id] === true }" @click="chooseRoot(item, true)">true</button>
              <button type="button" :disabled="isBusy(item.id)" :class="{ selected: rootAnswers[item.id] === false }" @click="chooseRoot(item, false)">false</button>
            </div>
          </template>

          <input
            v-else-if="schemaFor(item).type === 'string' || schemaFor(item).type === 'number' || schemaFor(item).type === 'integer'"
            :value="rootAnswers[item.id] ?? ''"
            :type="schemaFor(item).type === 'number' || schemaFor(item).type === 'integer' ? 'number' : 'text'"
            :placeholder="schemaFor(item).description || schemaFor(item).title || '请输入响应'"
            :disabled="isBusy(item.id)"
            @input="setRootInput(item, $event)"
          />

          <div class="interrupt-footer">
            <button
              v-if="needsSubmit(item)"
              type="button"
              class="primary"
              :disabled="isBusy(item.id) || !isComplete(item)"
              @click="submit(item)"
            >提交</button>
            <button type="button" class="cancel" :disabled="isBusy(item.id)" @click="cancel(item)">取消请求</button>
          </div>
        </div>

        <small v-else>已记录，等待其余操作完成后由 CopilotKit 自动恢复运行。</small>
      </article>
    </div>

    <p v-if="error" class="interrupt-error">{{ error }}</p>
  </section>
</template>

<style scoped>
.agui-interrupt{margin:12px 0 6px;padding:13px;border:1px solid color-mix(in srgb,var(--da-accent-yellow) 36%,transparent);border-radius:13px;background:linear-gradient(150deg,#262119,#151B24);box-shadow:0 18px 48px rgba(0,0,0,.32),0 0 0 1px rgba(255,255,255,.025) inset;color:var(--da-text-primary);backdrop-filter:blur(18px)}
.agui-interrupt header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 1px 10px;border-bottom:1px solid color-mix(in srgb,var(--da-accent-yellow) 20%,transparent)}
.agui-interrupt header>div{display:flex;flex-direction:column;gap:4px}.agui-interrupt header span{color:var(--da-text-muted);font-size:10px;font-weight:750;letter-spacing:.12em}.agui-interrupt header b{color:var(--da-text-emphasis);font-size:13px;font-weight:650}.agui-interrupt header i{font-style:normal;color:var(--da-accent-yellow);font-size:10px;letter-spacing:.08em}
.interrupt-list{display:flex;flex-direction:column;gap:9px;margin-top:10px}.interrupt-list article{padding:10px;border:1px solid var(--da-border);border-radius:10px;background:rgba(255,255,255,.055)}.interrupt-list article.submitted{opacity:.72}
.interrupt-copy{display:flex;flex-direction:column;gap:4px}.interrupt-copy b{color:var(--da-text-primary);font-size:12px}.interrupt-copy p{margin:0;color:var(--da-text-secondary);font-size:11px;line-height:1.55}.interrupt-copy code{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--da-text-muted);font-size:10px}
.interrupt-response{display:flex;flex-direction:column;gap:9px;margin-top:10px}.interrupt-field{display:flex;flex-direction:column;gap:6px}.interrupt-field>span{color:var(--da-text-secondary);font-size:10.5px}.interrupt-field em{margin-left:3px;color:var(--da-accent-red);font-style:normal}
.interrupt-choices{display:flex;flex-wrap:wrap;gap:7px}.interrupt-choices button,.interrupt-footer button{padding:7px 10px;border:1px solid color-mix(in srgb,var(--da-accent-yellow) 28%,transparent);border-radius:7px;background:color-mix(in srgb,var(--da-accent-yellow) 8%,transparent);color:var(--da-text-primary);font-size:10.5px;cursor:pointer;transition:.16s}.interrupt-choices button:hover,.interrupt-choices button.selected,.interrupt-footer button.primary:hover{border-color:var(--da-accent-yellow);background:var(--da-accent-yellow);color:#17140d}
.interrupt-response input{height:32px;padding:0 9px;border:1px solid var(--da-border);border-radius:7px;outline:none;background:var(--da-surface-input);color:var(--da-text-primary);font:inherit;font-size:11px}.interrupt-response input:focus{border-color:var(--da-accent-yellow)}
.interrupt-footer{display:flex;justify-content:flex-end;gap:7px}.interrupt-footer button.cancel{border-color:var(--da-border);background:transparent;color:var(--da-text-muted)}.interrupt-footer button.cancel:hover{border-color:var(--da-border-strong);color:var(--da-text-primary)}
.interrupt-choices button:disabled,.interrupt-footer button:disabled,.interrupt-response input:disabled{opacity:.5;cursor:wait}.interrupt-list small{display:block;margin-top:8px;color:var(--da-text-muted);font-size:10px}.interrupt-error{margin:9px 0 0;color:#FFB0BC;font-size:10px}
@media(max-width:540px){.agui-interrupt{margin-left:0;margin-right:0}.interrupt-footer{justify-content:flex-start;flex-wrap:wrap}}
</style>
