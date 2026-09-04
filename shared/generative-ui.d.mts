export const UI_ACTIVITY_TYPE: 'dataagent.ui'
export type UiCard =
  | { id: string; kind: 'text' | 'markdown'; title: string; text: string }
  | { id: string; kind: 'metrics'; title: string; items: { label: string; value: string | number; detail: string }[] }
  | { id: string; kind: 'table'; title: string; columns: { key: string; label: string }[]; rows: Record<string, string | number>[] }
  | { id: string; kind: 'file'; title: string; url: string; name: string; mimeType: string; approvalMode?: 'next-interrupt'; approvalInterruptId?: string }
export type UiContent = { version: 1; surfaceId: string; title: string; summary: string; status: 'generating' | 'ready' | 'error' | 'removed'; cards: UiCard[] }
export function normalizeUiContent(value: unknown): UiContent | null
export function safeUiFileUrl(value: unknown): string
export function applyUiPatch(content: UiContent | null, patch: unknown): UiContent | null
export function uiContentFromToolOutput(output: unknown): UiContent | null
