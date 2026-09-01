export type ConversationFilePreview = {
  id: string
  name: string
  url: string
  mimeType: string
  size?: number
  approvalInterruptId?: string
}

export function fileKindLabel(file: Pick<ConversationFilePreview, 'name' | 'mimeType'>) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (file.mimeType === 'text/markdown' || ['md', 'markdown', 'mdx'].includes(extension)) return 'Markdown'
  if (file.mimeType.startsWith('image/')) return '图片'
  if (file.mimeType === 'application/pdf' || extension === 'pdf') return 'PDF'
  if (file.mimeType.startsWith('text/') || ['json', 'yaml', 'yml', 'csv', 'sql', 'xml', 'log'].includes(extension)) return '文本'
  return extension ? extension.toUpperCase() : '文件'
}

export function formatFileSize(size?: number) {
  if (!size || size < 1) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
