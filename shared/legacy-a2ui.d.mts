export type LegacyA2uiProjection = {
  title: string
  summary: string
  status: 'generating' | 'ready' | 'error' | 'removed'
  operations: Record<string, any>[]
  artifacts: { id: string; name: string; url: string; mimeType: string; category: 'output'; approvalInterruptId?: string }[]
}
export function legacyUiToA2ui(value: unknown, messageId: string): LegacyA2uiProjection | null
