export const applyCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
}

export const openSse = (res) => {
  applyCors(res)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()
}

export const writeSse = (res, value) => {
  if (!res.writableEnded) res.write(`data: ${JSON.stringify(value)}\n\n`)
}

export async function* parseSse(response) {
  if (!response.ok) throw new Error(`SSE request failed: ${response.status} ${response.statusText}`)
  if (!response.body) throw new Error('SSE response does not contain a body')

  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!data || data === '[DONE]') continue
      try {
        yield JSON.parse(data)
      } catch {
        yield { type: 'raw', data }
      }
    }
  }
}

