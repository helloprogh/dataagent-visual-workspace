const isSafeId = (value) => typeof value === 'string'
  && value.length > 0
  && value.length <= 256
  && !/[\u0000-\u001f\u007f]/.test(value)

const cookieValue = (cookieHeader, name) => {
  if (!cookieHeader || !name) return undefined
  for (const pair of cookieHeader.split(';')) {
    const index = pair.indexOf('=')
    if (index < 0) continue
    const key = pair.slice(0, index).trim()
    if (key !== name) continue
    return pair.slice(index + 1).trim()
  }
  return undefined
}

export const modelSelectionFromCookie = (cookieHeader, cookieName = process.env.AGUI_MODEL_COOKIE || 'agui_model') => {
  const raw = cookieValue(cookieHeader, cookieName)
  if (!raw) return undefined
  try {
    const value = JSON.parse(decodeURIComponent(raw))
    if (!Array.isArray(value) || value.length !== 2) return undefined
    const providerID = typeof value[0] === 'string' ? value[0].trim() : ''
    const modelID = typeof value[1] === 'string' ? value[1].trim() : ''
    if (!isSafeId(providerID) || !isSafeId(modelID)) return undefined
    return { providerID, modelID }
  } catch {
    return undefined
  }
}
