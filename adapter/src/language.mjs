const SAFE_LOCALE = /^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{2,8})*$/

export const parseCookies = (header = '') => Object.fromEntries(
  String(header)
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('=')
      if (separator < 0) return [entry, '']
      const name = entry.slice(0, separator).trim()
      const rawValue = entry.slice(separator + 1).trim()
      let value = rawValue
      try {
        value = decodeURIComponent(rawValue)
      } catch {
        // Keep the original cookie value when percent-decoding fails.
      }
      return [name, value]
    }),
)

export const normalizeLanguage = (value) => {
  const input = String(value ?? '').trim()
  if (!input || !SAFE_LOCALE.test(input)) return undefined
  const parts = input.replaceAll('_', '-').split('-')
  const [language, ...rest] = parts
  return [
    language.toLowerCase(),
    ...rest.map((part, index) => index === 0 && /^[A-Za-z]{2}$/.test(part)
      ? part.toUpperCase()
      : part),
  ].join('-')
}

export const languageFromCookie = (cookieHeader, cookieName = process.env.AGUI_LANGUAGE_COOKIE || 'locale') => {
  const cookies = parseCookies(cookieHeader)
  return normalizeLanguage(cookies[cookieName])
}

export const languageInstruction = (language) => language
  ? `Respond to the user in ${language}. Keep code, identifiers, API names, filenames, and quoted source text in their original form when appropriate.`
  : undefined
