import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const readRepo = async path => fs.readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
const readConversation = path => readRepo(`frontend/src/components/conversation/${path}`)
const templateOf = source => source.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? ''

test('conversation HITL uses CopilotKit native interrupt lifecycle through the fully typed message view', async () => {
  const [chat, controller] = await Promise.all([
    readConversation('ConversationChat.vue'),
    readConversation('AguiInterruptController.vue'),
  ])

  assert.match(controller, /useInterrupt\(\)/)
  assert.doesNotMatch(chat, /ResumeEntry|pendingInterrupts|decisions|function\s+decide\s*\(/)
  assert.match(chat, /CopilotChatMessageView/)
  assert.match(chat, /#message-view=/)
  assert.match(chat, /<CopilotChatMessageView[\s\S]*?#interrupt=/)
  assert.match(chat, /#interrupt="\{ interrupt, interrupts, resolve, cancel \}"/)
  assert.match(chat, /:interrupt="interrupt"[\s\S]*:interrupts="interrupts"[\s\S]*:resolve="resolve"[\s\S]*:cancel="cancel"/)
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
  assert.match(field, /itemChoices\.length/)
  assert.match(field, /toggleArrayChoice/)
  assert.match(field, /variants\.length/)
  assert.match(field, /<AguiSchemaField[\s\S]*:depth="depth \+ 1"/)
  assert.match(field, /高级|JSON 响应|applyRawJson/)
  assert.match(helpers, /schema\.enum|normalized\.enum/)
  assert.match(helpers, /schema\.oneOf|normalized\.oneOf/)
  assert.match(helpers, /normalized\.anyOf/)
  assert.match(helpers, /normalized\.allOf|schema\.allOf/)
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
    readConversation('ReasoningProcessCard.vue'),
    readRepo('frontend/src/components/genui/ToolStatus.vue'),
    readRepo('frontend/src/components/AssistantPanel.vue'),
  ])

  for (const source of sources) {
    assert.doesNotMatch(templateOf(source), /AG-UI|HUMAN IN THE LOOP|ACTION REQUIRED|CopilotKit|OpenCode/i)
  }

  const index = await readRepo('frontend/index.html')
  assert.doesNotMatch(index, /AG-UI|CopilotKit|OpenCode/i)
})
