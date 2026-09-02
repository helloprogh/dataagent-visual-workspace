import type { ConversationSession } from './types'

export function userFacingSessionName(value?: string) {
  const source = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!source || /^(AG-UI session|new session)$/i.test(source)) return '未命名需求'

  return source
    .replace(/\bAG-?UI\b/gi, '')
    .replace(/\bOpenCode2?\b/gi, '')
    .replace(/\bHITL\b/gi, '人工确认')
    .replace(/请使用\s*read\s*工具(?:只)?/gi, '')
    .replace(/\bThink\b/gi, '思考')
    .replace(/当前项目/g, '项目')
    .replace(/\s+/g, ' ')
    .trim() || '未命名需求'
}

export function presentSessions(sessions: ConversationSession[]) {
  const names = sessions.map(session => userFacingSessionName(session.displayName))
  const totals = new Map<string, number>()
  names.forEach(name => totals.set(name, (totals.get(name) ?? 0) + 1))
  const seen = new Map<string, number>()

  return sessions.map((session, index) => {
    const name = names[index]
    const occurrence = (seen.get(name) ?? 0) + 1
    seen.set(name, occurrence)
    return {
      ...session,
      presentationName: (totals.get(name) ?? 0) > 1 ? `${name} · ${occurrence}` : name,
    }
  })
}
