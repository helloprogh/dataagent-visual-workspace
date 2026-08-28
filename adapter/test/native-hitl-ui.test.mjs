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
  assert.match(chat, /:interrupt="interrupt"[\s\S]*:interrupts="interrupts"[\s\S]*:resolve="resolve"/)
  assert.doesNotMatch(chat, /:cancel="cancel"/)
})

test('interrupt choices are rendered from responseSchema instead of a fixed option list', async () => {
  const card = await readConversation('AguiInterruptCard.vue')

  assert.match(card, /interrupt\.responseSchema/)
  assert.match(card, /schema\.enum/)
  assert.match(card, /schema\.oneOf/)
  assert.doesNotMatch(card, /['"]once['"]|['"]always['"]|['"]reject['"]/)
  assert.doesNotMatch(templateOf(card), />取消</)
  assert.doesNotMatch(card, /props\.cancel|async function cancel/)
})

test('user-facing interface does not expose protocol or framework terminology', async () => {
  const sources = await Promise.all([
    readConversation('AguiInterruptCard.vue'),
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
