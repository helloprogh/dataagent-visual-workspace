import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '@copilotkit/vue/styles.css'
import './uiux-soft-technical-dark.css'
import './visual-workspace.css'
import './layout-shell.css'
import './app-navigation-pages.css'
import './opencode-management.css'
import './composer-model-placement.css'
import App from './App.vue'

createApp(App).use(ElementPlus).mount('#app')
