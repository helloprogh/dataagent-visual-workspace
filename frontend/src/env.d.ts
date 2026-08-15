/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGUI_URL?: string
  readonly VITE_AGENT_ID?: string
  readonly VITE_AGENT_DISPLAY_NAME?: string
  readonly VITE_AGUI_TOKEN?: string
  readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
