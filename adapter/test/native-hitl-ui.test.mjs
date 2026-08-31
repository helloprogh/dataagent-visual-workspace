import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const readRepo = async path => fs.readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
const readConversation = path => readRepo(`frontend/src/features/conversation/${path}`)
const templateOf = source => source.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? ''

test('conversation HITL uses direct AG-UI interrupt and resume lifecycle', async () => {
  const [runtime, card, client] = await Promise.all([
    readConversation('composables/useAgentConversation.ts'),
    readConversation('components/InterruptCard.vue'),
    readRepo('frontend/src/agui/client.ts'),
  ])

  assert.match(client, /new HttpAgent/)
  assert.match(runtime, /pendingInterrupts/)
  assert.match(runtime, /outcome\?\.type === 'interrupt'/)
  assert.match(runtime, /target\.runAgent\(\{ resume: entries \}/)
  assert.match(runtime, /target\.pendingInterrupts\s*=\s*\[\]/)
  assert.match(runtime, /必须一次处理当前 Run 的全部待处理中断/)
  assert.doesNotMatch(runtime, /@copilotkit|useInterrupt|CopilotChat/i)
  assert.match(card, /ResumeEntry/)
})

test('interrupt UI is driven by responseSchema rather than permission-specific choices', async () => {
  const card = await readConversation('components/InterruptCard.vue')

  assert.match(card, /responseSchema/)
  assert.match(card, /\.enum/)
  assert.match(card, /\.oneOf/)
  assert.doesNotMatch(card, /\['once',\s*'always',\s*'reject'\]/)
  assert.doesNotMatch(card, /status:\s*['"]cancelled['"]/)
  assert.doesNotMatch(templateOf(card), /取消本次运行/)
  assert.doesNotMatch(templateOf(card), /AG-UI|CopilotKit|OpenCode/i)
})

test('pending interrupts are restored through the same AG-UI endpoint hydration run', async () => {
  const [runtime, client, gateway] = await Promise.all([
    readConversation('composables/useAgentConversation.ts'),
    readRepo('frontend/src/agui/client.ts'),
    readRepo('adapter/src/server-entry.mjs'),
  ])

  assert.match(client, /mode=hydrate/)
  assert.match(runtime, /createHydrationClient/)
  assert.match(runtime, /dataagent:\s*\{ mode: 'hydrate' \}/)
  assert.match(gateway, /forwardedProps\?\.dataagent\?\.mode/)
  assert.match(gateway, /pendingInterrupts\(threadId\)/)
  assert.doesNotMatch(runtime, /\/interrupts?['"`]/)
})

test('user-facing conversation UI does not expose protocol or framework terminology', async () => {
  const sources = await Promise.all([
    readConversation('components/AgentChat.vue'),
    readConversation('components/InterruptCard.vue'),
    readConversation('components/ConversationMessage.vue'),
    readConversation('components/ConversationSidebar.vue'),
  ])

  for (const source of sources) {
    assert.doesNotMatch(templateOf(source), /AG-UI|HUMAN IN THE LOOP|ACTION REQUIRED|CopilotKit|OpenCode/i)
  }

  const index = await readRepo('frontend/index.html')
  assert.doesNotMatch(index, /AG-UI|CopilotKit|OpenCode/i)
})
