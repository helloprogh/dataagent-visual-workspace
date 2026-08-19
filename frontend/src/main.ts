import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '@copilotkit/vue/styles.css'
import './style.css'
import './layout-shell.css'
import App from './App.vue'

createApp(App).use(ElementPlus).mount('#app')
