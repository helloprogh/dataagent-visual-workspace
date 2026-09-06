export type UploadState<T> = {
  status: 'queued' | 'uploading' | 'uploaded' | 'failed'
  error?: string
  uploaded?: { sessionId: string; value: T }
}

// All workers settle before returning, so retry cannot overlap an older batch.
export async function uploadAttachments<T, I extends UploadState<T>>(
  items: I[], sessionId: string, upload: (item: I) => Promise<T>, signal: AbortSignal,
  concurrency = 3,
): Promise<T[]> {
  const results = new Array<T>(items.length)
  let cursor = 0
  let failed = false
  async function worker() {
    while (cursor < items.length && !signal.aborted) {
      const index = cursor++
      const item = items[index]!
      if (item.uploaded?.sessionId === sessionId) {
        item.status = 'uploaded'
        results[index] = item.uploaded.value
        continue
      }
      item.status = 'uploading'
      item.error = undefined
      try {
        const value = await upload(item)
        signal.throwIfAborted()
        item.uploaded = { sessionId, value }
        item.status = 'uploaded'
        results[index] = value
      } catch (reason) {
        item.status = signal.aborted ? 'queued' : 'failed'
        item.error = signal.aborted ? undefined : reason instanceof Error ? reason.message : String(reason)
        failed = true
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1)) }, worker))
  signal.throwIfAborted()
  if (failed) throw new Error('部分附件上传失败，请重试失败附件或移除后发送')
  return results
}
