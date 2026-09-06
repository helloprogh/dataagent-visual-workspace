export type ApprovalSchema = Record<string, any>
export type ApprovalIssue = { kind: 'unsupported' | 'required' | 'type' | 'constraint'; path: string; keyword: string }

const scalar = (value: unknown) => typeof value === 'string' || typeof value === 'boolean'
  || typeof value === 'number' && Number.isFinite(value)
const annotations = new Set(['title', 'description', 'default', 'examples', '$schema', '$id', 'enumNames', 'readOnly', 'writeOnly', 'deprecated'])
const keywords = new Set(['type', 'properties', 'required', 'additionalProperties', 'enum', 'oneOf', 'const', 'items',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'format',
  'minItems', 'maxItems', 'uniqueItems'])

/** This is the renderer's explicit subset, not a general JSON Schema engine. */
export function unsupportedApprovalSchema(schema: ApprovalSchema, path = '$', depth = 0): ApprovalIssue[] {
  const issue = (keyword: string): ApprovalIssue[] => [{ kind: 'unsupported', path, keyword }]
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || depth > 2) return issue('schema')
  for (const key of Object.keys(schema)) {
    if (!keywords.has(key) && !annotations.has(key) && !key.startsWith('x-')) return issue(key)
  }
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']) {
    if (schema[key] !== undefined && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key]) || key === 'multipleOf' && schema[key] <= 0)) return issue(key)
  }
  for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems']) {
    if (schema[key] !== undefined && (!Number.isSafeInteger(schema[key]) || schema[key] < 0)) return issue(key)
  }
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== 'string') return issue('pattern')
    try { new RegExp(schema.pattern, 'u') } catch { return issue('pattern') }
  }
  if (schema.format !== undefined && !['date', 'date-time', 'email', 'uri'].includes(schema.format)) return issue('format')
  if (schema.const !== undefined && !scalar(schema.const)) return issue('const')
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || !schema.enum.every(scalar))) return issue('enum')
  if (schema.oneOf !== undefined && (!Array.isArray(schema.oneOf) || !schema.oneOf.length
    || !schema.oneOf.every((branch: any) => branch && scalar(branch.const)
      && Object.keys(branch).every(key => key === 'const' || annotations.has(key)))
    || new Set(schema.oneOf.map((branch: any) => JSON.stringify(branch.const))).size !== schema.oneOf.length)) return issue('oneOf')
  if (schema.type === 'object') {
    if (depth !== 0 || !schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) return issue('object')
    if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') return issue('additionalProperties')
    if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every((key: unknown) => typeof key === 'string' && Object.hasOwn(schema.properties, key)))) return issue('required')
    return Object.entries(schema.properties).flatMap(([key, field]) => unsupportedApprovalSchema(field as ApprovalSchema, `${path}.${key}`, depth + 1))
  }
  if (schema.type === 'array') {
    if (!schema.items || !(schema.items.enum || schema.items.oneOf)) return issue('items')
    return unsupportedApprovalSchema(schema.items, `${path}[]`, depth + 1)
  }
  if (!['string', 'number', 'integer', 'boolean'].includes(schema.type)
    && !(schema.type === undefined && (schema.enum || schema.oneOf || schema.const !== undefined))) return issue('type')
  return []
}

function validDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateApproval(schema: ApprovalSchema, value: unknown): ApprovalIssue[] {
  const unsupported = unsupportedApprovalSchema(schema)
  if (unsupported.length) return unsupported
  const visit = (rule: ApprovalSchema, input: any, path: string): ApprovalIssue[] => {
    const fail = (kind: ApprovalIssue['kind'], keyword: string): ApprovalIssue[] => [{ kind, path, keyword }]
    if (input === undefined || input === null) return fail('required', 'required')
    if (rule.type === 'object') {
      if (typeof input !== 'object' || Array.isArray(input)) return fail('type', 'object')
      const issues: ApprovalIssue[] = []
      for (const [key, child] of Object.entries(rule.properties)) {
        if (input[key] === undefined && !rule.required?.includes(key)) continue
        issues.push(...visit(child as ApprovalSchema, input[key], `${path}.${key}`))
      }
      if (Object.keys(input).some(key => !Object.hasOwn(rule.properties, key))) issues.push(...fail('constraint', 'additionalProperties'))
      return issues
    }
    if (rule.type === 'array') {
      if (!Array.isArray(input)) return fail('type', 'array')
      if (rule.minItems !== undefined && input.length < rule.minItems) return fail('constraint', 'minItems')
      if (rule.maxItems !== undefined && input.length > rule.maxItems) return fail('constraint', 'maxItems')
      if (rule.uniqueItems && new Set(input.map(value => JSON.stringify(value))).size !== input.length) return fail('constraint', 'uniqueItems')
      return input.flatMap((item: unknown, index: number) => visit(rule.items, item, `${path}[${index}]`))
    }
    if (rule.type === 'boolean' && typeof input !== 'boolean') return fail('type', 'boolean')
    if (rule.type === 'string' && typeof input !== 'string') return fail('type', 'string')
    if (['number', 'integer'].includes(rule.type) && (typeof input !== 'number' || !Number.isFinite(input)
      || rule.type === 'integer' && !Number.isInteger(input))) return fail('type', rule.type)
    if (typeof input === 'number') {
      for (const [key, invalid] of Object.entries({
        minimum: input < rule.minimum, maximum: input > rule.maximum,
        exclusiveMinimum: input <= rule.exclusiveMinimum, exclusiveMaximum: input >= rule.exclusiveMaximum,
        multipleOf: rule.multipleOf !== undefined && Math.abs(input / rule.multipleOf - Math.round(input / rule.multipleOf)) > 1e-9,
      })) if (rule[key] !== undefined && invalid) return fail('constraint', key)
    }
    if (typeof input === 'string') {
      const length = Array.from(input).length
      if (rule.minLength !== undefined && length < rule.minLength) return fail('constraint', 'minLength')
      if (rule.maxLength !== undefined && length > rule.maxLength) return fail('constraint', 'maxLength')
      if (rule.pattern && !new RegExp(rule.pattern, 'u').test(input)) return fail('constraint', 'pattern')
      if (rule.format === 'date' && !validDate(input)) return fail('constraint', 'date')
      if (rule.format === 'date-time' && (!validDate(input.slice(0, 10))
        || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(input)
        || !Number.isFinite(Date.parse(input)))) return fail('constraint', 'date-time')
      if (rule.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return fail('constraint', 'email')
      if (rule.format === 'uri') { try { new URL(input) } catch { return fail('constraint', 'uri') } }
    }
    if (rule.const !== undefined && input !== rule.const) return fail('constraint', 'const')
    const choices = rule.oneOf?.map((branch: any) => branch.const) ?? rule.enum
    if (choices && !choices.includes(input) && !(rule['x-custom'] && typeof input === 'string')) return fail('constraint', 'enum')
    return []
  }
  return visit(schema, value, '$')
}
