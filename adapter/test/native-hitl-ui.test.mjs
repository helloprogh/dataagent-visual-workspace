import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const readFrontend = async (path) => fs.readFile(new URL(`../../frontend/src/components/conversation/${path}`, import.meta.url), 'utf8')

test('conversation HITL uses CopilotKit native interrupt lifecycle', async () => {
  const [chat, controller] = await Promise.all([
    readFrontend('ConversationChat.vue'),
    readFrontend('AguiInterruptController.vue'),
  ])

  assert.match(controller, /useInterrupt\(\)/)
  assert.doesNotMatch(chat, /ResumeEntry|pendingInterrupts|decisions|function\s+decide\s*\(/)
  assert.match(chat, /#interrupt=/)
})

test('interrupt choices are rendered from AG-UI responseSchema', async () => {
  const card = await readFrontend('AguiInterruptCard.vue')

  assert.match(card, /interrupt\.responseSchema/)
  assert.match(card, /schema\.enum/)
  assert.match(card, /schema\.oneOf/)
  assert.doesNotMatch(card, /['"]once['"]|['"]always['"]|['"]reject['"]/)
})
