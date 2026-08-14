import type { Component } from 'vue'
import type { ZodType } from 'zod'

export type GenUIEntry = {
  name: string
  title: string
  description: string
  schema: ZodType
  component: Component
}
