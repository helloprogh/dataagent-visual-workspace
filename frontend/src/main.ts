import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './uiux-soft-technical-dark.css'
import './visual-workspace.css'
import './layout-shell.css'
import './conversation-shell.css'
import './app-navigation-pages.css'
import './opencode-management.css'
import './composer-model-placement.css'
import './theme-controls.css'
import './light-theme.css'
import './light-component-overrides.css'
import { initializeTheme } from './theme'
import App from './App.vue'

initializeTheme()
createApp(App).use(ElementPlus).mount('#app')
