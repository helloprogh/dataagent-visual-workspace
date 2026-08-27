/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGUI_URL?: string
  readonly VITE_AGUI_UPLOAD_URL?: string
  readonly VITE_AGUI_PROXY_TARGET?: string
  readonly VITE_AGUI_UPLOAD_PROXY_TARGET?: string
  readonly VITE_DATAAGENT_WEB_API_BASE?: string
  readonly VITE_DATAAGENT_API_BASE?: string
  readonly VITE_MANAGEMENT_API_BASE?: string
  readonly VITE_AGENT_ID?: string
  readonly VITE_AGENT_DISPLAY_NAME?: string
  readonly VITE_AGUI_TOKEN?: string
  readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
