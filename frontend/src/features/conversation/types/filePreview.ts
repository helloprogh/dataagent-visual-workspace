import { dataAgentWebApi } from '../../../shared/config/api'

export type ConversationFilePreview = {
  id: string
  name: string
  url: string
  mimeType: string
  size?: number
  approvalInterruptId?: string
  approvalResolved?: boolean
  category?: 'input' | 'output'
  version?: number
  createdAt?: number
  /** Internal correlation for files created by a tool in an assistant turn. */
  sourceMessageId?: string
  /** Internal workspace path used to retire a generated card after deletion. */
  sourcePath?: string
}

export type ArchiveEntry = {
  path: string
  kind: 'file' | 'directory'
  size: number
}

/** Archive manifests are for preview; downloads must return the original bytes. */
export function fileDownloadUrl(file: Pick<ConversationFilePreview, 'url'>) {
  const archiveRoute = dataAgentWebApi('/agui/workspace-archive')
  return file.url.startsWith(`${archiveRoute}?`)
    ? `${dataAgentWebApi('/agui/workspace-file')}${file.url.slice(archiveRoute.length)}`
    : file.url
}

export function fileBadgeLabel(file: Pick<ConversationFilePreview, 'name' | 'mimeType'>) {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : ''
  return extension?.slice(0, 4).toUpperCase() || fileKindLabel(file).slice(0, 3)
}

export function fileKindLabel(file: Pick<ConversationFilePreview, 'name' | 'mimeType'>) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (file.mimeType === 'text/markdown' || ['md', 'markdown', 'mdx'].includes(extension)) return 'Markdown'
  if (file.mimeType.startsWith('image/')) return '图片'
  if (file.mimeType === 'application/pdf' || extension === 'pdf') return 'PDF'
  if (file.mimeType === 'application/zip' || extension === 'zip') return 'ZIP'
  if (file.mimeType.startsWith('text/') || ['json', 'yaml', 'yml', 'csv', 'sql', 'xml', 'log'].includes(extension)) return '文本'
  return extension ? extension.toUpperCase() : '文件'
}

export function formatFileSize(size?: number) {
  if (!size || size < 1) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
