import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const readRepo = async path => fs.readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
const readConversation = path => readRepo(`frontend/src/components/conversation/${path}`)
const templateOf = source => source.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? ''
const visibleTextOf = source => templateOf(source)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\{\{[\s\S]*?\}\}/g, ' ')

test('conversation HITL resumes through the exact CopilotChat thread clone and standard resume array', async () => {
  const [chat, host, lifecycle] = await Promise.all([
    readConversation('ConversationChat.vue'),
    readConversation('AguiInterruptHost.vue'),
    readConversation('AguiInterruptLifecycle.vue'),
  ])

  assert.match(chat, /<AguiInterruptHost/)
  assert.match(chat, /:agent-id="agentId"/)
  assert.match(chat, /:thread-id="threadId \|\| materializedSessionId"/)
  assert.doesNotMatch(chat, /useInterrupt/)
  assert.doesNotMatch(chat, /ResumeEntry|pendingInterrupts|decisions|function\s+decide\s*\(/)
  assert.match(chat, /CopilotChatMessageView/)
  assert.match(chat, /#message-view=/)

  assert.match(host, /<AguiInterruptLifecycle/)
  assert.match(host, /:agent-id="agentId"/)
  assert.match(host, /:thread-id="threadId"/)
  assert.doesNotMatch(host, /CopilotChatConfigurationProvider/)

  assert.match(lifecycle, /useAgent\(\{[\s\S]*agentId:\s*\(\)\s*=>\s*props\.agentId,[\s\S]*threadId:\s*\(\)\s*=>\s*props\.threadId/)
  assert.match(lifecycle, /resolvedAgent\.pendingInterrupts/)
  assert.match(lifecycle, /onRunFinishedEvent/)
  assert.match(lifecycle, /buildResumeArray\(open, responses\)/)
  assert.match(lifecycle, /copilotkit\.value\.runAgent\(\{\s*agent:\s*currentAgent,\s*resume\s*\}\)/)
  assert.match(lifecycle, /responses\[id\]\s*=\s*\{\s*status:\s*'resolved'/)
  assert.match(lifecycle, /responses\[id\]\s*=\s*\{\s*status:\s*'cancelled'/)
  assert.doesNotMatch(lifecycle, /useInterrupt/)
})

test('interrupt response UI is JSON-Schema driven and covers single choice, multi choice, forms, nesting and fallback JSON', async () => {
  const [card, field, helpers] = await Promise.all([
    readConversation('AguiInterruptCard.vue'),
    readConversation('AguiSchemaField.vue'),
    readConversation('agui-response-schema.ts'),
  ])

  assert.match(card, /interrupt\.responseSchema/)
  assert.match(card, /<AguiSchemaField/)
  assert.match(field, /choicesFor/)
  assert.match(field, /type === 'object'/)
  assert.match(field, /type === 'array'/)
  assert.match(field, /arrayChoiceOptions/)
  assert.match(field, /arrayAllowsCustomString/)
  assert.match(field, /toggleArrayChoice/)
  assert.match(field, /addCustomArrayValue/)
  assert.match(field, /tupleSchemas/)
  assert.match(field, /allowsAdditionalProperties/)
  assert.match(field, /variants\.length/)
  assert.match(field, /<AguiSchemaField[\s\S]*:depth="depth \+ 1"/)
  assert.match(field, /高级|JSON 响应|applyRawJson/)
  assert.match(helpers, /schema\.enum|normalized\.enum/)
  assert.match(helpers, /schema\.oneOf|normalized\.oneOf/)
  assert.match(helpers, /normalized\.anyOf/)
  assert.match(helpers, /normalized\.allOf|schema\.allOf/)
  assert.match(helpers, /prefixItems/)
  assert.match(helpers, /additionalProperties/)
  assert.match(helpers, /minItems/)
  assert.match(helpers, /maxItems/)
  assert.match(helpers, /required/)
  assert.doesNotMatch(card, /['"]once['"]|['"]always['"]|['"]reject['"]/)
})

test('parallel interrupts are staged in the UI and submitted atomically as native resume entries', async () => {
  const card = await readConversation('AguiInterruptCard.vue')

  assert.match(card, /activeInterrupts\.value\.every\(isComplete\)/)
  assert.match(card, /async function submitAll\(\)/)
  assert.match(card, /for \(const interrupt of activeInterrupts\.value\)/)
  assert.match(card, /await props\.resolve\(answers\[interrupt\.id\], interrupt\.id\)/)
  assert.match(card, /await props\.cancel\(interrupt\.id\)/)
  assert.match(card, /isInterruptExpired/)
  assert.doesNotMatch(card, /async function chooseField|async function chooseRoot/)
})

test('user-facing interface does not expose protocol or framework terminology in normal product copy', async () => {
  const sources = await Promise.all([
    readConversation('AguiInterruptCard.vue'),
    readConversation('ReasoningProcessCard.vue'),
    readRepo('frontend/src/components/genui/ToolStatus.vue'),
    readRepo('frontend/src/components/AssistantPanel.vue'),
  ])

  for (const source of sources) {
    assert.doesNotMatch(visibleTextOf(source), /AG-UI|HUMAN IN THE LOOP|ACTION REQUIRED|CopilotKit|OpenCode|resume\[?\]?|resolved|cancelled/i)
  }

  const index = await readRepo('frontend/index.html')
  assert.doesNotMatch(index, /AG-UI|CopilotKit|OpenCode/i)
})
