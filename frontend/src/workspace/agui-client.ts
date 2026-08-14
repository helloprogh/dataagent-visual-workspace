import type { AguiEvent, ChatMessage } from './types'

export interface RunInput {
  threadId: string
  runId: string
  messages: ChatMessage[]
  state?: Record<string, unknown>
}

export async function runAgent(url: string, input: RunInput, onEvent: (event: AguiEvent) => void, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(input),
    signal,
  })
  if (!response.ok) throw new Error(`AG-UI request failed (${response.status})`)
  if (!response.body) throw new Error('AG-UI response stream is empty')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
      if (!data || data === '[DONE]') continue
      onEvent(JSON.parse(data) as AguiEvent)
    }
  }
}

