export type AppTheme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'dataagent.theme'

export function readTheme(): AppTheme {
  return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: AppTheme, persist = true) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function initializeTheme(): AppTheme {
  const theme = readTheme()
  applyTheme(theme, false)
  return theme
}
