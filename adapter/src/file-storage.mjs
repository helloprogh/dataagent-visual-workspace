import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const defaultDirectory = fileURLToPath(new URL('../.data/uploads/', import.meta.url))
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const safeFilename = (value) => {
  const name = path.basename(String(value || 'attachment')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim()
  return name || 'attachment'
}

const requestHeaders = (req) => {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue
    if (Array.isArray(value)) value.forEach(item => headers.append(key, item))
    else headers.set(key, value)
  }
  return headers
}

export class FileStorage {
  constructor(directory = process.env.ADAPTER_UPLOAD_DIR || defaultDirectory) {
    this.directory = path.resolve(directory)
  }

  async upload(req, origin) {
    const declaredSize = Number(req.headers['content-length'] ?? 0)
    if (declaredSize > MAX_UPLOAD_BYTES + 1024 * 1024) throw new Error('文件超过 10 MB 上传限制')

    const request = new Request(origin, {
      method: 'POST',
      headers: requestHeaders(req),
      body: Readable.toWeb(req),
      duplex: 'half',
    })
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('上传请求缺少 file')
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('文件超过 10 MB 上传限制')

    const id = randomUUID()
    const filename = safeFilename(file.name)
    const mimeType = String(file.type || 'application/octet-stream')
    const bytes = Buffer.from(await file.arrayBuffer())
    await mkdir(this.directory, { recursive: true })
    const storedPath = path.join(this.directory, `${id}.bin`)
    const metadataPath = path.join(this.directory, `${id}.json`)
    await writeFile(storedPath, bytes)
    await writeFile(metadataPath, `${JSON.stringify({ id, filename, mimeType, size: bytes.length, storedPath }, null, 2)}\n`, 'utf8')
    return { id, filename, mimeType, size: bytes.length, storedPath }
  }

  async read(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null
    try {
      const metadata = JSON.parse(await readFile(path.join(this.directory, `${id}.json`), 'utf8'))
      const storedPath = path.resolve(String(metadata.storedPath ?? ''))
      if (path.dirname(storedPath) !== this.directory || path.basename(storedPath) !== `${id}.bin`) return null
      return { ...metadata, bytes: await readFile(storedPath) }
    } catch {
      return null
    }
  }
}

export { MAX_UPLOAD_BYTES }
