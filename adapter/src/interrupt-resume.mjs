const resumeSignature = (resume) => JSON.stringify([...resume]
  .map((item) => ({
    interruptId: item.interruptId,
    status: item.status,
    payload: item.payload,
    metadata: item.metadata,
  }))
  .sort((left, right) => String(left.interruptId).localeCompare(String(right.interruptId))))

const assertNotExpired = (interrupt) => {
  if (!interrupt.expiresAt) return
  const expiresAt = Date.parse(interrupt.expiresAt)
  if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
    throw new Error(`Interrupt ${interrupt.id} expired at ${interrupt.expiresAt}`)
  }
}

const normalizeQuestionAnswers = (interrupt, payload) => {
  const answers = payload?.answers
  if (!Array.isArray(answers)) throw new Error(`Interrupt ${interrupt.id} requires payload.answers`)
  const expected = Number(interrupt.metadata?.questionCount)
  if (Number.isFinite(expected) && answers.length !== expected) {
    throw new Error(`Interrupt ${interrupt.id} requires ${expected} question answers; received ${answers.length}`)
  }
  return answers.map((answer, index) => {
    if (!Array.isArray(answer) || !answer.length) {
      throw new Error(`Interrupt ${interrupt.id} answer ${index + 1} must contain at least one value`)
    }
    return answer.map((value) => {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Interrupt ${interrupt.id} answer ${index + 1} must contain non-empty strings`)
      }
      return value
    })
  })
}

const dispatchResumeEntry = async ({ client, sessionId, interrupt, entry }) => {
  assertNotExpired(interrupt)
  const kind = interrupt.metadata?.kind ?? 'permission'

  if (kind === 'question') {
    if (entry.status === 'cancelled') return client.rejectQuestion(interrupt.id)
    if (entry.status !== 'resolved') throw new Error(`Interrupt ${interrupt.id} has unsupported resume status ${entry.status}`)
    return client.replyQuestion(interrupt.id, normalizeQuestionAnswers(interrupt, entry.payload))
  }

  if (kind === 'permission') {
    const decision = entry.status === 'cancelled' ? 'reject' : entry.payload?.decision
    if (!['once', 'always', 'reject'].includes(decision)) {
      throw new Error(`Interrupt ${interrupt.id} requires payload.decision to be once, always, or reject`)
    }
    return client.replyPermission(sessionId, interrupt.id, decision, entry.payload?.message)
  }

  throw new Error(`Interrupt ${interrupt.id} has unsupported OpenCode interrupt kind: ${kind}`)
}

export const applyResume = async ({ threadId, sessionId, resume, registry, client }) => {
  const signature = resumeSignature(resume)
  const pending = await registry.pendingInterrupts(threadId)
  if (!pending.length) {
    const receipt = await registry.lastResume(threadId)
    if (receipt?.signature === signature) {
      return { resumedToolCallIds: receipt.resumedToolCallIds ?? [], replayed: true }
    }
    throw new Error('Thread does not have a pending AG-UI interrupt')
  }

  const entries = new Map(resume.map((item) => [item.interruptId, item]))
  const pendingIds = new Set(pending.map((item) => item.id))
  const uncovered = pending.filter((item) => !entries.has(item.id)).map((item) => item.id)
  const unknown = resume.filter((item) => !pendingIds.has(item.interruptId)).map((item) => item.interruptId)
  if (entries.size !== resume.length) throw new Error('RunAgentInput.resume contains duplicate interrupt ids')
  if (uncovered.length || unknown.length) {
    throw new Error(`RunAgentInput.resume must cover all pending interrupts${uncovered.length ? `; missing: ${uncovered.join(', ')}` : ''}${unknown.length ? `; unknown: ${unknown.join(', ')}` : ''}`)
  }

  for (const interrupt of pending) {
    await dispatchResumeEntry({
      client,
      sessionId,
      interrupt,
      entry: entries.get(interrupt.id),
    })
  }

  const resumedToolCallIds = pending.map((item) => item.toolCallId).filter(Boolean)
  await registry.resolveInterrupts(threadId, { signature, resumedToolCallIds, resolvedAt: Date.now() })
  return { resumedToolCallIds, replayed: false }
}

export const interruptResumeInternals = {
  resumeSignature,
  normalizeQuestionAnswers,
}
