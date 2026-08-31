<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { Interrupt, ResumeEntry } from '@ag-ui/client'

const props = defineProps<{ interrupts: Interrupt[]; busy?: boolean }>()
const emit = defineEmits<{ resume: [entries: ResumeEntry[]] }>()

type Schema = Record<string, any>
const answers = reactive<Record<string, Record<string, any>>>({})
const rootAnswers = reactive<Record<string, any>>({})

const title = computed(() => {
  const reason = props.interrupts[0]?.reason
  if (reason === 'input_required') return '需要补充信息'
  if (reason === 'confirmation') return '请确认'
  if (reason === 'tool_call') return '操作确认'
  return '需要你的处理'
})

function schemaOf(interrupt: Interrupt): Schema {
  return (interrupt.responseSchema ?? {}) as Schema
}

function fieldsOf(interrupt: Interrupt) {
  const schema = schemaOf(interrupt)
  if (schema.type !== 'object' || !schema.properties) return []
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : [])
  return Object.entries(schema.properties).map(([name, raw]) => ({
    name,
    schema: (raw ?? {}) as Schema,
    required: required.has(name),
  }))
}

function choicesOf(schema: Schema) {
  if (Array.isArray(schema.oneOf)) {
    const choices = schema.oneOf
      .filter((item: any) => item && Object.prototype.hasOwnProperty.call(item, 'const'))
      .map((item: any) => ({ label: String(item.title ?? item.const), value: item.const }))
    if (choices.length) return choices
  }
  if (!Array.isArray(schema.enum)) return []
  const names = Array.isArray(schema['x-enumNames']) ? schema['x-enumNames'] : schema.enumNames ?? []
  return schema.enum.map((value: any, index: number) => ({ label: String(names[index] ?? value), value }))
}

function payloadOf(interrupt: Interrupt) {
  return fieldsOf(interrupt).length ? { ...(answers[interrupt.id] ?? {}) } : rootAnswers[interrupt.id]
}

function complete(interrupt: Interrupt) {
  const fields = fieldsOf(interrupt)
  if (!fields.length) {
    const schema = schemaOf(interrupt)
    if (choicesOf(schema).length || ['string', 'number', 'integer', 'boolean'].includes(schema.type)) {
      return rootAnswers[interrupt.id] !== undefined && rootAnswers[interrupt.id] !== ''
    }
    return true
  }
  return fields.every(field => !field.required || (
    answers[interrupt.id]?.[field.name] !== undefined
    && answers[interrupt.id]?.[field.name] !== ''
    && (!Array.isArray(answers[interrupt.id]?.[field.name]) || answers[interrupt.id][field.name].length > 0)
  ))
}

const canSubmit = computed(() => props.interrupts.length > 0 && props.interrupts.every(complete))

function submit() {
  if (!canSubmit.value || props.busy) return
  emit('resume', props.interrupts.map(interrupt => ({
    interruptId: interrupt.id,
    status: 'resolved',
    payload: payloadOf(interrupt),
  } as ResumeEntry)))
}

function cancel() {
  if (props.busy) return
  emit('resume', props.interrupts.map(interrupt => ({
    interruptId: interrupt.id,
    status: 'cancelled',
  } as ResumeEntry)))
}

watch(() => props.interrupts, interrupts => {
  for (const interrupt of interrupts) {
    answers[interrupt.id] ??= {}
    const schema = schemaOf(interrupt)
    if (rootAnswers[interrupt.id] === undefined && schema.default !== undefined) rootAnswers[interrupt.id] = schema.default
    for (const field of fieldsOf(interrupt)) {
      if (answers[interrupt.id][field.name] === undefined && field.schema.default !== undefined) {
        answers[interrupt.id][field.name] = field.schema.default
      }
    }
  }
}, { immediate: true, deep: true })
</script>

<template>
  <section class="interrupt-card" role="alert" aria-live="polite">
    <header class="interrupt-card__header">
      <div>
        <b>{{ title }}</b>
        <span v-if="interrupts.length > 1">{{ interrupts.length }} 项待处理</span>
      </div>
      <small>等待用户</small>
    </header>

    <article v-for="interrupt in interrupts" :key="interrupt.id" class="interrupt-card__item">
      <p>{{ interrupt.message || 'Agent 需要你的输入后才能继续。' }}</p>

      <template v-if="fieldsOf(interrupt).length">
        <div v-for="field in fieldsOf(interrupt)" :key="field.name" class="interrupt-field">
          <label>{{ field.schema.title || field.name }}<em v-if="field.required">*</em></label>

          <el-select
            v-if="choicesOf(field.schema).length && field.schema.type !== 'array'"
            v-model="answers[interrupt.id][field.name]"
            :disabled="busy"
          >
            <el-option v-for="choice in choicesOf(field.schema)" :key="JSON.stringify(choice.value)" :label="choice.label" :value="choice.value" />
          </el-select>

          <el-checkbox-group
            v-else-if="field.schema.type === 'array' && choicesOf(field.schema.items ?? {}).length"
            v-model="answers[interrupt.id][field.name]"
            :disabled="busy"
          >
            <el-checkbox v-for="choice in choicesOf(field.schema.items)" :key="JSON.stringify(choice.value)" :value="choice.value">{{ choice.label }}</el-checkbox>
          </el-checkbox-group>

          <el-switch v-else-if="field.schema.type === 'boolean'" v-model="answers[interrupt.id][field.name]" :disabled="busy" />
          <el-input-number v-else-if="field.schema.type === 'number' || field.schema.type === 'integer'" v-model="answers[interrupt.id][field.name]" :disabled="busy" />
          <el-date-picker v-else-if="field.schema.format === 'date' || field.schema.format === 'date-time'" v-model="answers[interrupt.id][field.name]" type="date" value-format="YYYY-MM-DD" :disabled="busy" />
          <el-input v-else v-model="answers[interrupt.id][field.name]" :type="field.schema['x-multiline'] ? 'textarea' : 'text'" :placeholder="field.schema.description" :disabled="busy" />
        </div>
      </template>

      <template v-else>
        <div v-if="choicesOf(schemaOf(interrupt)).length" class="interrupt-choices">
          <el-radio-group v-model="rootAnswers[interrupt.id]" :disabled="busy">
            <el-radio-button v-for="choice in choicesOf(schemaOf(interrupt))" :key="JSON.stringify(choice.value)" :value="choice.value">{{ choice.label }}</el-radio-button>
          </el-radio-group>
        </div>
        <el-switch v-else-if="schemaOf(interrupt).type === 'boolean'" v-model="rootAnswers[interrupt.id]" :disabled="busy" />
        <el-input-number v-else-if="schemaOf(interrupt).type === 'number' || schemaOf(interrupt).type === 'integer'" v-model="rootAnswers[interrupt.id]" :disabled="busy" />
        <el-input v-else-if="schemaOf(interrupt).type === 'string'" v-model="rootAnswers[interrupt.id]" :disabled="busy" :placeholder="schemaOf(interrupt).description || '请输入内容'" />
      </template>
    </article>

    <footer class="interrupt-card__actions">
      <el-button :disabled="busy" @click="cancel">取消本次运行</el-button>
      <el-button type="primary" :loading="busy" :disabled="!canSubmit" @click="submit">继续</el-button>
    </footer>
  </section>
</template>

<style scoped>
.interrupt-card { width: min(100%, var(--da-content-max)); margin: var(--da-space-3) auto; overflow: hidden; border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-lg); background: var(--da-surface-2); box-shadow: inset 0.1875rem 0 color-mix(in srgb, var(--da-accent-yellow) 55%, transparent); }
.interrupt-card__header { display: flex; align-items: center; justify-content: space-between; gap: var(--da-space-3); padding: var(--da-space-3) var(--da-space-4); border-bottom: 0.0625rem solid var(--da-border); }
.interrupt-card__header div { display: flex; align-items: baseline; gap: var(--da-space-2); }
.interrupt-card__header b { color: var(--da-text-emphasis); }
.interrupt-card__header span, .interrupt-card__header small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.interrupt-card__item { padding: var(--da-space-4); }
.interrupt-card__item + .interrupt-card__item { border-top: 0.0625rem solid var(--da-border); }
.interrupt-card__item p { margin: 0 0 var(--da-space-3); color: var(--da-text-secondary); line-height: 1.6; }
.interrupt-field { display: grid; gap: var(--da-space-2); margin-top: var(--da-space-3); }
.interrupt-field label { color: var(--da-text-muted); font-size: var(--da-font-size-sm); }
.interrupt-field em { margin-left: var(--da-space-1); color: var(--da-accent-red); font-style: normal; }
.interrupt-choices { display: flex; flex-wrap: wrap; gap: var(--da-space-2); }
.interrupt-card__actions { display: flex; justify-content: flex-end; gap: var(--da-space-2); padding: var(--da-space-3) var(--da-space-4); border-top: 0.0625rem solid var(--da-border); }
</style>
