import { dataAgentWebApi } from '../../../shared/config/api'
import { requestJson } from '../../../shared/api/http'
import type { ModelSelection } from '../../model/types'

export async function createConversation(model: ModelSelection): Promise<string> {
  const body = await requestJson<any>(dataAgentWebApi('/session'), {
    method: 'POST',
    body: JSON.stringify({ model: { providerID: model.providerID, id: model.id } }),
  }, '新建对话失败')

  if (body?.code != null && body.code !== 20000) {
    throw new Error(`新建对话失败${body?.message ? `：${body.message}` : ''}`)
  }

  const sessionId = body?.data?.data?.id
    ?? body?.data?.id
    ?? body?.data?.sessionId
    ?? body?.sessionId
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('新建对话接口未返回 sessionId')
  }
  return sessionId.trim()
}

export async function interruptConversation(sessionId: string): Promise<void> {
  const id = sessionId.trim()
  if (!id) return
  await requestJson(dataAgentWebApi(`/session/${encodeURIComponent(id)}/interrupt`), {
    method: 'POST',
  }, '中断对话失败')
}

export async function uploadConversationFile(file: File, threadId: string) {
  const formData = new FormData()
  formData.append('file', file, file.name)
  formData.append('threadId', threadId)
  const headers = new Headers()
  const token = import.meta.env.VITE_AGUI_TOKEN
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(dataAgentWebApi('/agui/file/upload'), {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error(`文件上传失败 (${response.status})`)

  const body = await response.json()
  const uploaded = body?.data ?? body?.file ?? body
  const fileId = uploaded?.fileId ?? uploaded?.file_id ?? uploaded?.id
  const uri = uploaded?.url ?? uploaded?.uri ?? uploaded?.downloadUrl ?? uploaded?.download_url ?? uploaded?.path ?? fileId
  if (!uri) throw new Error('上传接口未返回 fileId 或文件地址')

  return {
    type: file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('audio/') ? 'audio'
        : file.type.startsWith('video/') ? 'video'
          : 'document',
    source: {
      type: 'url',
      value: String(uri),
      mimeType: (uploaded?.mimeType ?? uploaded?.mime_type ?? uploaded?.contentType ?? file.type) || 'application/octet-stream',
    },
    metadata: {
      ...(fileId ? { fileId: String(fileId) } : {}),
      filename: uploaded?.filename ?? uploaded?.name ?? file.name,
      size: uploaded?.size ?? file.size,
    },
  }
}
