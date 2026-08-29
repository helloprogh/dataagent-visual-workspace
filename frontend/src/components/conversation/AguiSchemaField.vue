<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  choicesFor,
  defaultValueForSchema,
  inferSchemaType,
  jsonEqual,
  normalizeSchema,
  prettyJson,
  schemaAllowsNull,
  schemaInputType,
  validateSchemaValue,
  variantsFor,
  type JsonSchema,
} from './agui-response-schema'

defineOptions({ name: 'AguiSchemaField' })

const props = withDefaults(defineProps<{
  schema: JsonSchema
  modelValue: any
  label?: string
  required?: boolean
  disabled?: boolean
  depth?: number
}>(), {
  label: '',
  required: false,
  disabled: false,
  depth: 0,
})

const emit = defineEmits<{ 'update:modelValue': [value: any] }>()

const schema = computed(() => normalizeSchema(props.schema))
const type = computed(() => inferSchemaType(schema.value))
const choices = computed(() => choicesFor(schema.value))
const variants = computed(() => variantsFor(schema.value))
const nullable = computed(() => schemaAllowsNull(schema.value))
const objectProperties = computed(() => Object.entries(schema.value.properties ?? {}) as Array<[string, JsonSchema]>)
const definedPropertyNames = computed(() => new Set(objectProperties.value.map(([name]) => name)))
const requiredNames = computed(() => new Set(Array.isArray(schema.value.required) ? schema.value.required.map(String) : []))
const tupleSchemas = computed<JsonSchema[]>(() => {
  if (Array.isArray(schema.value.prefixItems)) return schema.value.prefixItems.map((item: JsonSchema) => normalizeSchema(item))
  if (Array.isArray(schema.value.items)) return schema.value.items.map((item: JsonSchema) => normalizeSchema(item))
  return []
})
const itemSchema = computed(() => normalizeSchema(schema.value.items && !Array.isArray(schema.value.items) ? schema.value.items : {}))
const itemChoices = computed(() => choicesFor(itemSchema.value))
const itemVariants = computed(() => variantsFor(itemSchema.value))
const arrayChoiceOptions = computed(() => {
  if (itemChoices.value.length) return itemChoices.value
  return itemVariants.value.flatMap(variant => choicesFor(variant))
})
const arrayAllowsCustomString = computed(() => itemVariants.value.some(variant => inferSchemaType(variant) === 'string' && choicesFor(variant).length === 0))
const arrayValue = computed<any[]>(() => Array.isArray(props.modelValue) ? props.modelValue : [])
const objectValue = computed<Record<string, any>>(() => props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue) ? props.modelValue : {})
const extraEntries = computed(() => Object.entries(objectValue.value).filter(([key]) => !definedPropertyNames.value.has(key)))
const allowsAdditionalProperties = computed(() => schema.value.additionalProperties !== false)
const additionalSchema = computed<JsonSchema>(() => normalizeSchema(
  schema.value.additionalProperties && typeof schema.value.additionalProperties === 'object'
    ? schema.value.additionalProperties
    : {},
))
const customArrayValues = computed(() => arrayValue.value.filter(item => !arrayChoiceOptions.value.some(choice => jsonEqual(choice.value, item))))
const variantIndex = ref(-1)
const rawJson = ref('')
const rawError = ref('')
const newPropertyName = ref('')
const propertyError = ref('')
const customArrayInput = ref('')

const selectedVariant = computed<JsonSchema | null>(() => {
  if (variantIndex.value < 0) return null
  return variants.value[variantIndex.value] ?? null
})

watch(() => props.modelValue, value => {
  rawJson.value = prettyJson(value)
  rawError.value = ''
  if (variants.value.length) {
    variantIndex.value = variants.value.findIndex(variant => validateSchemaValue(variant, value).length === 0)
  }
}, { immediate: true, deep: true })

function setValue(value: any) {
  emit('update:modelValue', value)
}

function setObjectChild(key: string, value: any) {
  setValue({ ...objectValue.value, [key]: value })
}

function removeObjectChild(key: string) {
  const next = { ...objectValue.value }
  delete next[key]
  setValue(next)
}

function addAdditionalProperty() {
  propertyError.value = ''
  const name = newPropertyName.value.trim()
  if (!name) {
    propertyError.value = '请输入字段名'
    return
  }
  if (Object.prototype.hasOwnProperty.call(objectValue.value, name)) {
    propertyError.value = '字段名已存在'
    return
  }
  const initial = defaultValueForSchema(additionalSchema.value)
  setObjectChild(name, initial === undefined ? null : initial)
  newPropertyName.value = ''
}

function selectChoice(value: any) {
  setValue(value)
}

function toggleArrayChoice(value: any) {
  const current = [...arrayValue.value]
  const index = current.findIndex(item => jsonEqual(item, value))
  if (index >= 0) {
    current.splice(index, 1)
    setValue(current)
    return
  }

  const max = typeof schema.value.maxItems === 'number' ? schema.value.maxItems : Number.POSITIVE_INFINITY
  if (max === 1) {
    setValue([value])
    return
  }
  if (current.length >= max) return
  current.push(value)
  setValue(current)
}

function addCustomArrayValue() {
  const value = customArrayInput.value.trim()
  if (!value) return
  const current = [...arrayValue.value]
  const max = typeof schema.value.maxItems === 'number' ? schema.value.maxItems : Number.POSITIVE_INFINITY
  if (max === 1) {
    setValue([value])
    customArrayInput.value = ''
    return
  }
  if (current.length >= max) return
  if (schema.value.uniqueItems && current.some(item => jsonEqual(item, value))) return
  current.push(value)
  setValue(current)
  customArrayInput.value = ''
}

function removeCustomArrayValue(value: any) {
  setValue(arrayValue.value.filter(item => !jsonEqual(item, value)))
}

function setArrayItem(index: number, value: any) {
  const next = [...arrayValue.value]
  while (next.length <= index) next.push(undefined)
  next[index] = value
  setValue(next)
}

function addArrayItem() {
  const max = typeof schema.value.maxItems === 'number' ? schema.value.maxItems : Number.POSITIVE_INFINITY
  if (arrayValue.value.length >= max) return
  const next = [...arrayValue.value]
  const initial = defaultValueForSchema(itemSchema.value)
  next.push(initial === undefined ? null : initial)
  setValue(next)
}

function removeArrayItem(index: number) {
  const min = typeof schema.value.minItems === 'number' ? schema.value.minItems : 0
  if (arrayValue.value.length <= min) return
  const next = [...arrayValue.value]
  next.splice(index, 1)
  setValue(next)
}

function setScalar(event: Event) {
  const target = event.target as HTMLInputElement
  if (type.value === 'number' || type.value === 'integer') {
    if (target.value === '') setValue(undefined)
    else setValue(Number(target.value))
    return
  }
  setValue(target.value)
}

function setNull() { setValue(null) }
function restoreFromNull() {
  const value = defaultValueForSchema(schema.value)
  if (value !== null && value !== undefined) setValue(value)
  else if (type.value === 'object') setValue({})
  else if (type.value === 'array') setValue([])
  else setValue(undefined)
}

function selectVariant(event: Event) {
  const index = Number((event.target as HTMLSelectElement).value)
  variantIndex.value = index
  const selected = variants.value[index]
  if (!selected) return
  const initial = defaultValueForSchema(selected)
  const selectedType = inferSchemaType(selected)
  setValue(initial === undefined
    ? selectedType === 'object'
      ? {}
      : selectedType === 'array'
        ? []
        : undefined
    : initial)
}

function applyRawJson() {
  rawError.value = ''
  try {
    setValue(rawJson.value.trim() === '' ? undefined : JSON.parse(rawJson.value))
  } catch (error) {
    rawError.value = error instanceof Error ? error.message : String(error)
  }
}

function variantLabel(variant: JsonSchema, index: number) {
  return String(variant.title ?? variant.description ?? `选项 ${index + 1}`)
}
</script>

<template>
  <div class="schema-field" :class="{ 'schema-field--nested': depth > 0 }">
    <div v-if="label || schema.title" class="schema-field__label">
      <span>{{ label || schema.title }}</span><em v-if="required">*</em>
    </div>
    <p v-if="schema.description" class="schema-field__description">{{ schema.description }}</p>

    <div v-if="nullable" class="schema-field__nullable">
      <button v-if="modelValue !== null" type="button" :disabled="disabled" @click="setNull">设为空值</button>
      <button v-else type="button" :disabled="disabled" @click="restoreFromNull">填写值</button>
    </div>

    <template v-if="modelValue === null && nullable">
      <div class="schema-field__null">null</div>
    </template>

    <template v-else-if="Object.prototype.hasOwnProperty.call(schema, 'const')">
      <code class="schema-field__const">{{ prettyJson(schema.const) }}</code>
    </template>

    <template v-else-if="choices.length">
      <div class="schema-field__choices" role="group" :aria-label="label || schema.title || '请选择'">
        <button
          v-for="choice in choices"
          :key="JSON.stringify(choice.value)"
          type="button"
          :disabled="disabled"
          :aria-pressed="jsonEqual(modelValue, choice.value)"
          :class="{ selected: jsonEqual(modelValue, choice.value) }"
          @click="selectChoice(choice.value)"
        >{{ choice.label }}</button>
      </div>
    </template>

    <template v-else-if="variants.length">
      <select
        class="schema-field__select"
        :value="variantIndex"
        :disabled="disabled"
        :aria-label="label || schema.title || '响应结构'"
        @change="selectVariant"
      >
        <option :value="-1" disabled>请选择响应结构</option>
        <option v-for="(variant, index) in variants" :key="index" :value="index">{{ variantLabel(variant, index) }}</option>
      </select>
      <AguiSchemaField
        v-if="selectedVariant"
        :schema="selectedVariant"
        :model-value="modelValue"
        :disabled="disabled"
        :depth="depth + 1"
        @update:model-value="setValue"
      />
    </template>

    <template v-else-if="type === 'boolean'">
      <div class="schema-field__choices" role="group" :aria-label="label || schema.title || '请选择'">
        <button type="button" :disabled="disabled" :aria-pressed="modelValue === true" :class="{ selected: modelValue === true }" @click="setValue(true)">是</button>
        <button type="button" :disabled="disabled" :aria-pressed="modelValue === false" :class="{ selected: modelValue === false }" @click="setValue(false)">否</button>
      </div>
    </template>

    <template v-else-if="type === 'object'">
      <div class="schema-field__object">
        <AguiSchemaField
          v-for="([key, childSchema]) in objectProperties"
          :key="key"
          :schema="childSchema"
          :model-value="objectValue[key]"
          :label="childSchema.title || key"
          :required="requiredNames.has(key)"
          :disabled="disabled"
          :depth="depth + 1"
          @update:model-value="setObjectChild(key, $event)"
        />

        <div v-for="([key, value]) in extraEntries" :key="`extra-${key}`" class="schema-field__extra">
          <div class="schema-field__extra-head"><span>{{ key }}</span><button type="button" :disabled="disabled" @click="removeObjectChild(key)">移除</button></div>
          <AguiSchemaField
            :schema="additionalSchema"
            :model-value="value"
            :disabled="disabled"
            :depth="depth + 1"
            @update:model-value="setObjectChild(key, $event)"
          />
        </div>

        <div v-if="allowsAdditionalProperties" class="schema-field__additional">
          <input v-model="newPropertyName" :disabled="disabled" type="text" placeholder="新增字段名" aria-label="新增字段名" @keydown.enter.prevent="addAdditionalProperty" />
          <button type="button" :disabled="disabled" @click="addAdditionalProperty">添加字段</button>
        </div>
        <small v-if="propertyError" class="schema-field__error">{{ propertyError }}</small>
      </div>
    </template>

    <template v-else-if="type === 'array' && tupleSchemas.length">
      <div class="schema-field__array">
        <div v-for="(tupleSchema, index) in tupleSchemas" :key="index" class="schema-field__array-item">
          <div class="schema-field__array-head"><span>{{ tupleSchema.title || `第 ${index + 1} 项` }}</span></div>
          <AguiSchemaField
            :schema="tupleSchema"
            :model-value="arrayValue[index]"
            :required="index < (schema.minItems ?? 0)"
            :disabled="disabled"
            :depth="depth + 1"
            @update:model-value="setArrayItem(index, $event)"
          />
        </div>
      </div>
    </template>

    <template v-else-if="type === 'array' && (arrayChoiceOptions.length || arrayAllowsCustomString)">
      <div v-if="arrayChoiceOptions.length" class="schema-field__choices schema-field__choices--multi" role="group" :aria-label="label || schema.title || '请选择多项'">
        <button
          v-for="choice in arrayChoiceOptions"
          :key="JSON.stringify(choice.value)"
          type="button"
          :disabled="disabled"
          :aria-pressed="arrayValue.some(item => jsonEqual(item, choice.value))"
          :class="{ selected: arrayValue.some(item => jsonEqual(item, choice.value)) }"
          @click="toggleArrayChoice(choice.value)"
        >
          <span class="schema-field__check" aria-hidden="true">{{ arrayValue.some(item => jsonEqual(item, choice.value)) ? '✓' : '' }}</span>
          {{ choice.label }}
        </button>
      </div>

      <div v-if="arrayAllowsCustomString" class="schema-field__custom-answer">
        <input
          v-model="customArrayInput"
          type="text"
          :disabled="disabled"
          :aria-label="`${label || schema.title || '回答'} 自定义回答`"
          placeholder="输入自定义回答"
          @keydown.enter.prevent="addCustomArrayValue"
        />
        <button type="button" :disabled="disabled" @click="addCustomArrayValue">添加</button>
      </div>
      <div v-if="customArrayValues.length" class="schema-field__custom-values">
        <span v-for="value in customArrayValues" :key="JSON.stringify(value)">{{ value }}<button type="button" :disabled="disabled" :aria-label="`移除 ${value}`" @click="removeCustomArrayValue(value)">×</button></span>
      </div>

      <small v-if="schema.minItems || schema.maxItems" class="schema-field__hint">
        <template v-if="schema.minItems">至少 {{ schema.minItems }} 项</template>
        <template v-if="schema.minItems && schema.maxItems"> · </template>
        <template v-if="schema.maxItems">最多 {{ schema.maxItems }} 项</template>
      </small>
    </template>

    <template v-else-if="type === 'array'">
      <div class="schema-field__array">
        <div v-for="(item, index) in arrayValue" :key="index" class="schema-field__array-item">
          <div class="schema-field__array-head"><span>第 {{ index + 1 }} 项</span><button type="button" :disabled="disabled" @click="removeArrayItem(index)">移除</button></div>
          <AguiSchemaField
            :schema="itemSchema"
            :model-value="item"
            :disabled="disabled"
            :depth="depth + 1"
            @update:model-value="setArrayItem(index, $event)"
          />
        </div>
        <button type="button" class="schema-field__add" :disabled="disabled || (typeof schema.maxItems === 'number' && arrayValue.length >= schema.maxItems)" @click="addArrayItem">+ 添加一项</button>
      </div>
    </template>

    <template v-else-if="type === 'string' || type === 'number' || type === 'integer'">
      <input
        class="schema-field__input"
        :type="schemaInputType(schema)"
        :value="modelValue ?? ''"
        :disabled="disabled || schema.readOnly === true"
        :aria-label="label || schema.title || '输入响应'"
        :placeholder="schema.examples?.[0] ?? schema.placeholder ?? ''"
        :min="schema.minimum"
        :max="schema.maximum"
        :step="schema.multipleOf ?? (type === 'integer' ? 1 : 'any')"
        :minlength="schema.minLength"
        :maxlength="schema.maxLength"
        :pattern="schema.pattern"
        @input="setScalar"
      />
    </template>

    <template v-else-if="type === 'null'">
      <div class="schema-field__null">null</div>
    </template>

    <template v-else>
      <div class="schema-field__raw">
        <textarea v-model="rawJson" :disabled="disabled" rows="6" spellcheck="false" :aria-label="label || schema.title || 'JSON 响应'"></textarea>
        <div class="schema-field__raw-actions"><button type="button" :disabled="disabled" @click="applyRawJson">应用 JSON</button></div>
        <small v-if="rawError" class="schema-field__error">JSON 解析失败：{{ rawError }}</small>
      </div>
    </template>
  </div>
</template>

<style scoped>
.schema-field{width:100%;min-width:0;display:flex;flex-direction:column;gap:7px}
.schema-field--nested{padding-top:2px}
.schema-field__label{display:flex;align-items:center;gap:3px;color:var(--da-text-secondary);font-size:12px;font-weight:620;line-height:1.35}
.schema-field__label em{color:var(--da-accent-red);font-style:normal}
.schema-field__description{margin:0;color:var(--da-text-muted);font-size:12px;line-height:1.5}
.schema-field__choices{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.schema-field__choices button,.schema-field__nullable button,.schema-field__array-head button,.schema-field__add,.schema-field__raw-actions button,.schema-field__additional button,.schema-field__extra-head button,.schema-field__custom-answer button{min-height:36px;padding:0 13px;border:1px solid var(--da-border);border-radius:8px;background:var(--da-surface-3);color:var(--da-text-primary);font-family:inherit;font-size:13px;font-weight:580;line-height:1;cursor:pointer;transition:border-color .15s ease,background .15s ease,color .15s ease}
.schema-field__choices button:hover:not(:disabled),.schema-field__nullable button:hover:not(:disabled),.schema-field__array-head button:hover:not(:disabled),.schema-field__add:hover:not(:disabled),.schema-field__raw-actions button:hover:not(:disabled),.schema-field__additional button:hover:not(:disabled),.schema-field__extra-head button:hover:not(:disabled),.schema-field__custom-answer button:hover:not(:disabled){border-color:var(--da-border-strong);background:var(--da-surface-4)}
.schema-field__choices button.selected{border-color:color-mix(in srgb,var(--da-accent-yellow) 52%,var(--da-border));background:color-mix(in srgb,var(--da-accent-yellow) 10%,var(--da-surface-3));color:var(--da-text-emphasis)}
.schema-field__choices--multi button{display:inline-flex;align-items:center;gap:7px}
.schema-field__check{width:14px;height:14px;display:grid;place-items:center;border:1px solid var(--da-border-strong);border-radius:4px;font-size:10px}
.schema-field__choices--multi button.selected .schema-field__check{border-color:color-mix(in srgb,var(--da-accent-yellow) 58%,var(--da-border));background:color-mix(in srgb,var(--da-accent-yellow) 12%,transparent)}
.schema-field__input,.schema-field__select,.schema-field__raw textarea,.schema-field__additional input,.schema-field__custom-answer input{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--da-border);border-radius:8px;outline:none;background:var(--da-surface-input);color:var(--da-text-primary);font-family:inherit;font-size:14px;line-height:1.4;transition:border-color .15s ease,box-shadow .15s ease}
.schema-field__input,.schema-field__select,.schema-field__additional input,.schema-field__custom-answer input{height:40px;padding:0 10px}
.schema-field__raw textarea{padding:9px 10px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.schema-field__input:focus,.schema-field__select:focus,.schema-field__raw textarea:focus,.schema-field__additional input:focus,.schema-field__custom-answer input:focus{border-color:color-mix(in srgb,var(--da-accent-yellow) 42%,var(--da-border));box-shadow:0 0 0 3px color-mix(in srgb,var(--da-accent-yellow) 6%,transparent)}
.schema-field__object{display:flex;flex-direction:column;gap:13px;padding:10px;border:1px solid color-mix(in srgb,var(--da-border) 82%,transparent);border-radius:9px;background:color-mix(in srgb,var(--da-surface-deep) 55%,transparent)}
.schema-field__extra{padding:9px;border:1px dashed var(--da-border);border-radius:8px}.schema-field__extra-head{margin-bottom:7px;display:flex;align-items:center;justify-content:space-between;color:var(--da-text-secondary);font-size:12px}.schema-field__extra-head button{min-height:28px;padding:0 8px;font-size:11px}
.schema-field__additional,.schema-field__custom-answer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.schema-field__additional button,.schema-field__custom-answer button{min-width:74px}
.schema-field__custom-values{display:flex;flex-wrap:wrap;gap:6px}.schema-field__custom-values>span{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid var(--da-border);border-radius:7px;background:var(--da-surface-deep);color:var(--da-text-secondary);font-size:12px}.schema-field__custom-values button{width:16px;height:16px;padding:0;border:0;background:transparent;color:var(--da-text-muted);cursor:pointer}
.schema-field__array{display:flex;flex-direction:column;gap:9px}
.schema-field__array-item{padding:10px;border:1px solid var(--da-border);border-radius:9px;background:color-mix(in srgb,var(--da-surface-deep) 45%,transparent)}
.schema-field__array-head{margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;color:var(--da-text-muted);font-size:12px}
.schema-field__array-head button{min-height:28px;padding:0 9px;font-size:11px}
.schema-field__add{align-self:flex-start}
.schema-field__nullable{display:flex;justify-content:flex-end}
.schema-field__nullable button{min-height:28px;padding:0 9px;background:transparent;color:var(--da-text-muted);font-size:11px}
.schema-field__null,.schema-field__const{display:block;padding:8px 10px;border:1px solid var(--da-border);border-radius:8px;background:var(--da-surface-code);color:var(--da-text-secondary);font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap}
.schema-field__hint{color:var(--da-text-muted);font-size:11px}
.schema-field__raw{display:flex;flex-direction:column;gap:7px}
.schema-field__raw-actions{display:flex;justify-content:flex-end}
.schema-field__raw-actions button{min-height:30px;font-size:12px}
.schema-field__error{color:#F1A1AE;font-size:12px;line-height:1.4}
button:disabled,input:disabled,select:disabled,textarea:disabled{opacity:.46;cursor:not-allowed}
@media(max-width:540px){.schema-field__choices button{flex:1 1 calc(50% - 4px);min-width:0}.schema-field__object{padding:8px}.schema-field__additional,.schema-field__custom-answer{grid-template-columns:1fr}.schema-field__additional button,.schema-field__custom-answer button{width:100%}}
</style>
