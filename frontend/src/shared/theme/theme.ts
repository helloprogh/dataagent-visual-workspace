import { ref } from 'vue'

export type AppTheme = 'dark' | 'light'

const STORAGE_KEY = 'dataagent.theme.v2'

function initialTheme(): AppTheme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return 'dark'
}

export const appTheme = ref<AppTheme>(initialTheme())

export function applyTheme(theme: AppTheme) {
  appTheme.value = theme
  document.documentElement.dataset.theme = theme
  localStorage.setItem(STORAGE_KEY, theme)
}

export function initializeTheme() {
  applyTheme(appTheme.value)
}

export function toggleTheme() {
  applyTheme(appTheme.value === 'dark' ? 'light' : 'dark')
}
