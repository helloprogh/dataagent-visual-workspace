export type JsonSchema = Record<string, any>
export type SchemaChoice = { value: any; label: string }

export function jsonEqual(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return left === right
  }
}

export function fallbackChoiceLabel(value: any) {
  if (typeof value !== 'string') return JSON.stringify(value)
  const normalized = value.trim().toLowerCase()
  if (/^(once|allow[_-]?once)$/.test(normalized)) return '允许一次'
  if (/^(always|allow[_-]?always)$/.test(normalized)) return '始终允许'
  if (/^(reject|deny)$/.test(normalized)) return '拒绝'
  if (/^(approve|allow|accept|yes)$/.test(normalized)) return '允许'
  if (/^(cancel|abort|no)$/.test(normalized)) return '取消'
  return value
}

export function normalizeSchema(schema: JsonSchema | undefined | null): JsonSchema {
  if (!schema || typeof schema !== 'object') return {}
  if (!Array.isArray(schema.allOf) || !schema.allOf.length) return schema

  const merged: JsonSchema = { ...schema }
  delete merged.allOf
  const required = new Set<string>(Array.isArray(schema.required) ? schema.required.map(String) : [])
  const properties: Record<string, JsonSchema> = { ...(schema.properties ?? {}) }

  for (const part of schema.allOf) {
    const normalized = normalizeSchema(part)
    Object.assign(merged, normalized)
    if (normalized.properties && typeof normalized.properties === 'object') {
      Object.assign(properties, normalized.properties)
    }
    if (Array.isArray(normalized.required)) normalized.required.forEach((item: unknown) => required.add(String(item)))
  }

  if (Object.keys(properties).length) merged.properties = properties
  if (required.size) merged.required = [...required]
  return merged
}

export function choicesFor(schema: JsonSchema | undefined | null): SchemaChoice[] {
  const normalized = normalizeSchema(schema)
  if (Array.isArray(normalized.oneOf)) {
    const choices = normalized.oneOf
      .filter((item: any) => item && Object.prototype.hasOwnProperty.call(item, 'const'))
      .map((item: any) => ({ value: item.const, label: String(item.title ?? fallbackChoiceLabel(item.const)) }))
    if (choices.length === normalized.oneOf.length) return choices
  }
  if (!Array.isArray(normalized.enum)) return []
  const labels = Array.isArray(normalized['x-enumNames'])
    ? normalized['x-enumNames']
    : Array.isArray(normalized.enumNames)
      ? normalized.enumNames
      : []
  return normalized.enum.map((value: any, index: number) => ({
    value,
    label: String(labels[index] ?? fallbackChoiceLabel(value)),
  }))
}

export function variantsFor(schema: JsonSchema | undefined | null): JsonSchema[] {
  const normalized = normalizeSchema(schema)
  const variants = Array.isArray(normalized.oneOf)
    ? normalized.oneOf
    : Array.isArray(normalized.anyOf)
      ? normalized.anyOf
      : []
  if (!variants.length) return []
  if (variants.every((item: any) => item && Object.prototype.hasOwnProperty.call(item, 'const'))) return []
  return variants.map((item: JsonSchema) => normalizeSchema(item))
}

export function schemaAllowsNull(schema: JsonSchema | undefined | null) {
  const normalized = normalizeSchema(schema)
  if (normalized.nullable === true) return true
  if (Array.isArray(normalized.type) && normalized.type.includes('null')) return true
  return Array.isArray(normalized.anyOf) && normalized.anyOf.some((item: JsonSchema) => item?.type === 'null')
}

export function inferSchemaType(schema: JsonSchema | undefined | null): string {
  const normalized = normalizeSchema(schema)
  if (typeof normalized.type === 'string') return normalized.type
  if (Array.isArray(normalized.type)) return normalized.type.find((item: unknown) => item !== 'null') ?? 'null'
  if (normalized.properties && typeof normalized.properties === 'object') return 'object'
  if (normalized.items) return 'array'
  if (Object.prototype.hasOwnProperty.call(normalized, 'const')) {
    if (normalized.const === null) return 'null'
    if (Array.isArray(normalized.const)) return 'array'
    return typeof normalized.const
  }
  const choices = choicesFor(normalized)
  if (choices.length) {
    const value = choices[0]?.value
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    return typeof value
  }
  return 'json'
}

export function defaultValueForSchema(schema: JsonSchema | undefined | null): any {
  const normalized = normalizeSchema(schema)
  if (Object.prototype.hasOwnProperty.call(normalized, 'default')) return structuredCloneSafe(normalized.default)
  if (Object.prototype.hasOwnProperty.call(normalized, 'const')) return structuredCloneSafe(normalized.const)

  const type = inferSchemaType(normalized)
  if (type === 'object') {
    const value: Record<string, any> = {}
    for (const [key, child] of Object.entries(normalized.properties ?? {})) {
      const childSchema = normalizeSchema(child as JsonSchema)
      if (Object.prototype.hasOwnProperty.call(childSchema, 'default') || Object.prototype.hasOwnProperty.call(childSchema, 'const')) {
        value[key] = defaultValueForSchema(childSchema)
      }
    }
    return value
  }
  if (type === 'array') return []
  if (type === 'null') return null
  return undefined
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

export function schemaInputType(schema: JsonSchema | undefined | null) {
  const normalized = normalizeSchema(schema)
  if (inferSchemaType(normalized) === 'number' || inferSchemaType(normalized) === 'integer') return 'number'
  if (normalized.format === 'email') return 'email'
  if (normalized.format === 'uri' || normalized.format === 'url') return 'url'
  if (normalized.format === 'date') return 'date'
  if (normalized.format === 'time') return 'time'
  if (normalized.format === 'password') return 'password'
  return 'text'
}

function typeMatches(type: string, value: any) {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === type
}

export function validateSchemaValue(schema: JsonSchema | undefined | null, value: any, path = '响应'): string[] {
  const normalized = normalizeSchema(schema)
  const errors: string[] = []

  if (value === undefined) {
    errors.push(`${path}尚未填写`)
    return errors
  }
  if (value === null) {
    if (!schemaAllowsNull(normalized) && inferSchemaType(normalized) !== 'null') errors.push(`${path}不允许为空`)
    return errors
  }

  if (Object.prototype.hasOwnProperty.call(normalized, 'const') && !jsonEqual(value, normalized.const)) {
    errors.push(`${path}必须为指定值`)
  }
  if (Array.isArray(normalized.enum) && !normalized.enum.some((item: any) => jsonEqual(item, value))) {
    errors.push(`${path}不是允许的选项`)
  }

  const variants = variantsFor(normalized)
  if (variants.length) {
    const validCount = variants.filter(variant => validateSchemaValue(variant, value, path).length === 0).length
    if (Array.isArray(normalized.oneOf) && validCount !== 1) errors.push(`${path}必须匹配且仅匹配一个可选结构`)
    if (Array.isArray(normalized.anyOf) && validCount < 1) errors.push(`${path}不匹配任何允许的结构`)
  }

  const type = inferSchemaType(normalized)
  if (type !== 'json' && !typeMatches(type, value)) {
    errors.push(`${path}类型应为 ${type}`)
    return errors
  }

  if (type === 'string') {
    if (typeof normalized.minLength === 'number' && value.length < normalized.minLength) errors.push(`${path}至少需要 ${normalized.minLength} 个字符`)
    if (typeof normalized.maxLength === 'number' && value.length > normalized.maxLength) errors.push(`${path}最多允许 ${normalized.maxLength} 个字符`)
    if (typeof normalized.pattern === 'string') {
      try {
        if (!new RegExp(normalized.pattern).test(value)) errors.push(`${path}格式不符合要求`)
      } catch {
        // Invalid producer regex should not make the client unusable; backend remains authoritative.
      }
    }
  }

  if (type === 'number' || type === 'integer') {
    if (typeof normalized.minimum === 'number' && value < normalized.minimum) errors.push(`${path}不能小于 ${normalized.minimum}`)
    if (typeof normalized.maximum === 'number' && value > normalized.maximum) errors.push(`${path}不能大于 ${normalized.maximum}`)
    if (typeof normalized.exclusiveMinimum === 'number' && value <= normalized.exclusiveMinimum) errors.push(`${path}必须大于 ${normalized.exclusiveMinimum}`)
    if (typeof normalized.exclusiveMaximum === 'number' && value >= normalized.exclusiveMaximum) errors.push(`${path}必须小于 ${normalized.exclusiveMaximum}`)
  }

  if (type === 'array') {
    if (typeof normalized.minItems === 'number' && value.length < normalized.minItems) errors.push(`${path}至少选择/填写 ${normalized.minItems} 项`)
    if (typeof normalized.maxItems === 'number' && value.length > normalized.maxItems) errors.push(`${path}最多选择/填写 ${normalized.maxItems} 项`)
    if (normalized.uniqueItems && new Set(value.map((item: any) => JSON.stringify(item))).size !== value.length) errors.push(`${path}不能包含重复项`)
    if (normalized.items && !Array.isArray(normalized.items)) {
      value.forEach((item: any, index: number) => errors.push(...validateSchemaValue(normalized.items, item, `${path}[${index + 1}]`)))
    }
  }

  if (type === 'object') {
    const required = new Set(Array.isArray(normalized.required) ? normalized.required.map(String) : [])
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined || value[key] === '') {
        errors.push(`${path}.${key} 为必填项`)
      }
    }
    for (const [key, childSchema] of Object.entries(normalized.properties ?? {})) {
      if (value[key] !== undefined) errors.push(...validateSchemaValue(childSchema as JsonSchema, value[key], `${path}.${key}`))
    }
    if (normalized.additionalProperties === false) {
      const allowed = new Set(Object.keys(normalized.properties ?? {}))
      for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key} 不是允许的字段`)
    }
  }

  return [...new Set(errors)]
}

export function prettyJson(value: any) {
  if (value === undefined) return ''
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}
