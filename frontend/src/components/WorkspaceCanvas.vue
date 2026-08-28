<script setup lang="ts">
import { computed } from 'vue'
import { componentMap } from '../genui/registry'
import { workspaceController } from '../workspace/store'

const document = computed(() => workspaceController.state.document)
const demoMode = workspaceController.demoMode
const updatedAt = computed(() => {
  const value = document.value?.updatedAt
  if (!value) return '--:--'
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
})
</script>

<template>
  <section class="visual-workspace">
    <div class="workspace-ambient workspace-ambient-a"></div>
    <div class="workspace-ambient workspace-ambient-b"></div>

    <header class="visual-toolbar">
      <div class="visual-title-block">
        <div class="visual-kicker"><span></span>分析结果</div>
        <div class="visual-title-row">
          <h1>{{ document?.title || '分析工作区' }}</h1>
          <span v-if="demoMode" class="mode-badge demo">演示</span>
          <span v-else class="live-badge"><i></i>实时</span>
        </div>
        <p>{{ document?.subtitle || '描述你的数据业务目标，我将逐步完成需求澄清、数据分析、验证与结果交付。' }}</p>
      </div>

      <div class="visual-toolbar-meta" aria-label="工作区状态">
        <span class="visual-meta-item"><i></i><b>{{ document?.widgets.length || 0 }}</b> 个模块</span>
        <span class="visual-meta-item">更新 <b>{{ updatedAt }}</b></span>
        <button class="icon-action" type="button" title="恢复当前工作区" aria-label="恢复当前工作区" @click="workspaceController.reset()">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15.6 7.1A6.2 6.2 0 1 0 16 12" />
            <path d="M15.6 3.7v3.8h-3.8" />
          </svg>
        </button>
      </div>
    </header>

    <div class="workspace-scroll">
      <div v-if="document?.widgets.length" class="workspace-grid">
        <article
          v-for="widget in document.widgets"
          :key="widget.id"
          class="workspace-widget"
          :data-component="widget.component"
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
              <span>暂不支持此模块</span>
              <strong>{{ widget.component }}</strong>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="workspace-empty">
        <div class="empty-orbit"><i></i><i></i><i></i><span>AI</span></div>
        <div class="empty-kicker">数据分析工作区</div>
        <h2>从一个数据业务目标开始</h2>
        <p>描述你的数据业务目标，我将与你逐步澄清需求，并完成数据方案、分析执行、治理验证与结果交付。</p>
        <div class="empty-prompts">
          <span>需求澄清</span>
          <span>数据方案</span>
          <span>数据分析</span>
          <span>质量验证</span>
          <span>结果交付</span>
        </div>
      </div>
    </div>
  </section>
</template>
