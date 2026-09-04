import { createApp } from 'vue'
import Fixture from './GenerativeUiFixture.vue'
import '../src/shared/styles/index.css'
import { initializeTheme } from '../src/shared/theme/theme'
initializeTheme()
createApp(Fixture).mount('#app')
