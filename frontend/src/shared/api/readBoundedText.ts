/** Retain at most maxBytes of UTF-8 text, including responses without a length. */
export async function readBoundedText(response: Response, maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError('Invalid preview byte limit')
  if (!response.body) return { text: '', truncated: false }
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let remaining = maxBytes
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return { text: text + decoder.decode(), truncated: false }
      const length = Math.min(value.byteLength, remaining)
      text += decoder.decode(value.subarray(0, length), { stream: true })
      remaining -= length
      if (value.byteLength > length) {
        await reader.cancel()
        // Do not flush an incomplete multi-byte character at the cutoff.
        return { text, truncated: true }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
