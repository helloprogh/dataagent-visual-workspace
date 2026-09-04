import path from 'node:path'
import { inflateRawSync } from 'node:zlib'

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_DIRECTORY_HEADER = 0x02014b50
const LOCAL_FILE_HEADER = 0x04034b50
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
export const MAX_ARCHIVE_ENTRIES = 2000
export const MAX_ARCHIVE_ENTRY_BYTES = 10 * 1024 * 1024

function safeEntryPath(value) {
  const raw = String(value ?? '').replaceAll('\\', '/')
  if (!raw || raw.includes('\u0000') || raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) return null
  const normalized = path.posix.normalize(raw)
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) return null
  return normalized
}

function endOfCentralDirectory(bytes) {
  const minimum = 22
  const start = Math.max(0, bytes.length - 0xffff - minimum)
  for (let offset = bytes.length - minimum; offset >= start; offset -= 1) {
    if (bytes.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset
  }
  return -1
}

export function readZipEntries(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ARCHIVE_BYTES) throw new Error('压缩包超过 50 MB 预览限制')
  if (bytes.length < 22) throw new Error('不是有效的 ZIP 文件')
  const end = endOfCentralDirectory(bytes)
  if (end < 0) throw new Error('不是有效的 ZIP 文件')
  const disk = bytes.readUInt16LE(end + 4)
  const centralDisk = bytes.readUInt16LE(end + 6)
  const count = bytes.readUInt16LE(end + 10)
  const centralSize = bytes.readUInt32LE(end + 12)
  const centralOffset = bytes.readUInt32LE(end + 16)
  if (disk !== 0 || centralDisk !== 0 || count > MAX_ARCHIVE_ENTRIES
    || centralOffset + centralSize > end || count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP 结构不受支持或已损坏')
  }

  const entries = []
  let cursor = centralOffset
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_HEADER) throw new Error('ZIP 目录结构不完整')
    const flags = bytes.readUInt16LE(cursor + 8)
    const compression = bytes.readUInt16LE(cursor + 10)
    const compressedSize = bytes.readUInt32LE(cursor + 20)
    const size = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const extraLength = bytes.readUInt16LE(cursor + 30)
    const commentLength = bytes.readUInt16LE(cursor + 32)
    const localOffset = bytes.readUInt32LE(cursor + 42)
    const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    const entryPath = safeEntryPath(name)
    if (!entryPath || compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('ZIP 包含不安全或不受支持的文件项')
    }
    entries.push({
      path: entryPath,
      kind: name.endsWith('/') ? 'directory' : 'file',
      size,
      compressedSize,
      compression,
      flags,
      localOffset,
    })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path))
}

export function readZipEntry(bytes, entry) {
  if (!entry || entry.kind !== 'file') throw new Error('ZIP 目录不可读取')
  if (entry.size > MAX_ARCHIVE_ENTRY_BYTES) throw new Error('压缩包内文件超过 10 MB 预览限制')
  const offset = entry.localOffset
  if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== LOCAL_FILE_HEADER) throw new Error('ZIP 文件项结构不完整')
  const nameLength = bytes.readUInt16LE(offset + 26)
  const extraLength = bytes.readUInt16LE(offset + 28)
  const start = offset + 30 + nameLength + extraLength
  const end = start + entry.compressedSize
  if (end > bytes.length || entry.flags & 1) throw new Error('ZIP 文件项不可读取')
  const compressed = bytes.subarray(start, end)
  if (entry.compression === 0) return Buffer.from(compressed)
  if (entry.compression === 8) return inflateRawSync(compressed, { maxOutputLength: MAX_ARCHIVE_ENTRY_BYTES })
  throw new Error('ZIP 压缩算法不受支持')
}
