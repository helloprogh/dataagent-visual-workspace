import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'x-markdown-vue/style'
import App from './app/App.vue'
import { i18n } from './i18n'
import { router } from './router'
import { initializeTheme } from './shared/theme/theme'
import './shared/styles/index.css'

initializeTheme()

createApp(App)
  .use(ElementPlus)
  .use(i18n)
  .use(router)
  .mount('#app')
