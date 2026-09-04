import type { Interrupt, ResumeEntry } from '@ag-ui/client'

type Schema = Record<string, any>

function firstChoice(schema: Schema) {
  if (Array.isArray(schema.oneOf)) {
    const choice = schema.oneOf.find(item => item && Object.prototype.hasOwnProperty.call(item, 'const'))
    if (choice) return { found: true, value: choice.const }
  }
  if (Array.isArray(schema.enum) && schema.enum.length) return { found: true, value: schema.enum[0] }
  if (schema.type === 'boolean') return { found: true, value: true }
  return { found: false, value: undefined }
}

/**
 * Builds the single affirmative response used by an actionable delivery card.
 * The event contract defines the first choice of a one-field form as its
 * confirmation choice. Anything more complex stays in the full approval UI.
 */
export function buildConfirmationResumeEntry(interrupt: Interrupt): ResumeEntry | null {
  if ((interrupt as any).metadata?.kind !== 'form') return null
  const schema = (interrupt.responseSchema ?? {}) as Schema
  if (schema.type === 'object' && schema.properties && typeof schema.properties === 'object') {
    const fields = Object.entries(schema.properties)
    if (fields.length !== 1) return null
    const [name, rawField] = fields[0]
    const choice = firstChoice((rawField ?? {}) as Schema)
    if (!choice.found) return null
    return {
      interruptId: interrupt.id,
      status: 'resolved',
      payload: { [name]: choice.value },
    } as ResumeEntry
  }
  const choice = firstChoice(schema)
  if (!choice.found) return null
  return {
    interruptId: interrupt.id,
    status: 'resolved',
    payload: choice.value,
  } as ResumeEntry
}
