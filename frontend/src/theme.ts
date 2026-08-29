export type AppTheme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'dataagent.theme'

export function readTheme(): AppTheme {
  return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: AppTheme, persist = true) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  // CopilotKit v2 keys its shadcn dark tokens off a `.dark` ancestor.
  // Keep that contract synchronized with the product-level data-theme state.
  root.classList.toggle('dark', theme === 'dark')
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function initializeTheme(): AppTheme {
  const theme = readTheme()
  applyTheme(theme, false)
  return theme
}
