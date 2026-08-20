<script setup lang="ts">
import { computed } from 'vue'
import { componentMap } from '../genui/registry'
import { workspaceController } from '../workspace/store'

const document = computed(() => workspaceController.state.document)
const demoMode = workspaceController.demoMode
const updatedAt = computed(() => {
  const value = document.value?.updatedAt
  if (!value) return '--:--'
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
})
</script>

<template>
  <section class="visual-workspace">
    <div class="workspace-ambient workspace-ambient-a"></div>
    <div class="workspace-ambient workspace-ambient-b"></div>

    <header class="visual-toolbar">
      <div class="visual-title-block">
        <div class="visual-kicker"><span></span> DYNAMIC RENDER SPACE</div>
        <div class="visual-title-row">
          <h1>{{ document?.title || 'Render Space' }}</h1>
          <span v-if="demoMode" class="mode-badge demo">DEMO MODE</span>
          <span v-else class="live-badge"><i></i> READY</span>
        </div>
        <p>{{ document?.subtitle || '描述你的数据业务目标，我将与你逐步澄清需求，并自主完成 Specification、数据方案、数据集成、ETL 开发、治理验证与交付。' }}</p>
      </div>

      <div class="visual-toolbar-meta">
        <div class="context-chip"><span>MODE</span><b>{{ demoMode ? 'Demo seed' : 'Agent driven' }}</b></div>
        <div class="context-chip"><span>RENDER</span><b>{{ document?.widgets.length || 0 }} modules</b></div>
        <div class="context-chip"><span>UPDATED</span><b>{{ updatedAt }}</b></div>
        <button class="icon-action" title="恢复当前模式的初始渲染区" @click="workspaceController.reset()">↻</button>
      </div>
    </header>

    <div class="workspace-scroll">
      <div v-if="document?.widgets.length" class="workspace-grid">
        <article
          v-for="widget in document.widgets"
          :key="widget.id"
          class="workspace-widget"
          :style="{
            gridColumn: `span ${widget.colSpan || 6}`,
            minHeight: widget.minHeight ? `${widget.minHeight}px` : undefined,
          }"
        >
          <div class="widget-frame">
            <div class="widget-scanline"></div>
            <component
              v-if="componentMap[widget.component]"
              :is="componentMap[widget.component]"
              v-bind="widget.props"
            />
            <div v-else class="unknown-widget">
              <span>UNRESOLVED MODULE</span>
              <strong>{{ widget.component }}</strong>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="workspace-empty">
        <div class="empty-orbit"><i></i><i></i><i></i><span>AI</span></div>
        <div class="empty-kicker">SA DATA DELIVERY RENDER SPACE</div>
        <h2>从一个数据业务目标开始</h2>
        <p>描述你的数据业务目标，我将与你逐步澄清需求，并自主完成 Specification、数据方案、数据集成、ETL 开发、治理验证与交付。</p>
        <div class="empty-prompts">
          <span>Specification</span>
          <span>数据方案</span>
          <span>数据集成</span>
          <span>ETL 开发</span>
          <span>治理验证</span>
          <span>交付</span>
        </div>
      </div>
    </div>
  </section>
</template>
