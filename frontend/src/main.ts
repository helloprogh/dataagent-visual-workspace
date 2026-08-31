import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'x-markdown-vue/style'
import App from './app/App.vue'
import './shared/styles/index.css'

createApp(App)
  .use(ElementPlus)
  .mount('#app')
