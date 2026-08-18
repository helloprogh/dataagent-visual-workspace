import assert from 'node:assert/strict'
import test from 'node:test'
import { OpenCodeAguiConverter } from '../src/converter.mjs'

const create = () => new OpenCodeAguiConverter({
  threadId: 'thread-reasoning',
  runId: 'run-reasoning',
  sessionId: 'ses-reasoning',
})

const flatten = (converter, events) => events.flatMap((source) => converter.convert(source))

test('emits a complete AG-UI reasoning lifecycle before the final assistant text', () => {
  const converter = create()
  const assistantMessageID = 'msg_014b8fb36001ow2DjYOQN93ZEn'
  const output = flatten(converter, [
    { type: 'session.reasoning.started', data: { sessionID: 'ses-reasoning', assistantMessageID, ordinal: 0 } },
    { type: 'session.reasoning.delta', data: { sessionID: 'ses-reasoning', assistantMessageID, ordinal: 0, delta: 'The user is greeting me.' } },
    { type: 'session.reasoning.ended', data: { sessionID: 'ses-reasoning', assistantMessageID, ordinal: 0 } },
    { type: 'session.text.started', data: { sessionID: 'ses-reasoning', assistantMessageID, ordinal: 0 } },
    { type: 'session.text.delta', data: { sessionID: 'ses-reasoning', assistantMessageID, ordinal: 0, delta: '你好！' } },
    { type: 'session.text.ended', data: { sessionID: 'ses-reasoning', assistantMessageID, ordinal: 0 } },
  ])

  assert.deepEqual(output.map((item) => item.type), [
    'REASONING_START',
    'REASONING_MESSAGE_START',
    'REASONING_MESSAGE_CONTENT',
    'REASONING_MESSAGE_END',
    'REASONING_END',
    'TEXT_MESSAGE_START',
    'TEXT_MESSAGE_CONTENT',
    'TEXT_MESSAGE_END',
  ])

  const reasoningStart = output[0]
  const reasoningMessageStart = output[1]
  const reasoningMessageEnd = output[3]
  const reasoningEnd = output[4]
  const textStart = output[5]

  assert.equal(reasoningMessageStart.role, 'reasoning')
  assert.equal(reasoningMessageStart.messageId, `${assistantMessageID}-reasoning`)
  assert.equal(reasoningMessageEnd.messageId, reasoningMessageStart.messageId)
  assert.equal(reasoningStart.messageId, reasoningMessageStart.messageId)
  assert.equal(reasoningEnd.messageId, reasoningStart.messageId)
  assert.equal(textStart.messageId, assistantMessageID)
  assert.notEqual(reasoningMessageStart.messageId, textStart.messageId)
})

test('legacy message.part reasoning never collides with the final text message id', () => {
  const converter = create()
  const reasoning = converter.convert({
    type: 'message.part.delta',
    properties: {
      sessionID: 'ses-reasoning',
      messageID: 'legacy-assistant-1',
      partID: 'reasoning-part',
      field: 'reasoning',
      delta: 'thinking',
    },
  })
  const text = converter.convert({
    type: 'message.part.delta',
    properties: {
      sessionID: 'ses-reasoning',
      messageID: 'legacy-assistant-1',
      partID: 'text-part',
      field: 'text',
      delta: 'answer',
    },
  })

  assert.deepEqual(reasoning.map((item) => item.type), [
    'REASONING_START',
    'REASONING_MESSAGE_START',
    'REASONING_MESSAGE_CONTENT',
  ])
  assert.deepEqual(text.map((item) => item.type), [
    'TEXT_MESSAGE_START',
    'TEXT_MESSAGE_CONTENT',
  ])
  assert.equal(reasoning[1].messageId, 'legacy-assistant-1-reasoning')
  assert.equal(text[0].messageId, 'legacy-assistant-1')
  assert.notEqual(reasoning[1].messageId, text[0].messageId)
})
