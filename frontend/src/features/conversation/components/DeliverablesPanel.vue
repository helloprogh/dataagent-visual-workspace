<script setup lang="ts">
import { computed } from 'vue'
import { fileKindLabel, formatFileSize, type ConversationFilePreview } from '../types/filePreview'

const props = defineProps<{
  files: ConversationFilePreview[]
  pendingApprovals?: number
}>()

const emit = defineEmits<{
  close: []
  select: [file: ConversationFilePreview]
}>()

const inputFiles = computed(() => props.files.filter(file => file.category === 'input'))
const outputFiles = computed(() => props.files.filter(file => file.category !== 'input'))
</script>

<template>
  <aside class="deliverables-panel" aria-label="交付物面板">
    <header>
      <div>
        <small>DELIVERABLES</small>
        <b>交付物</b>
      </div>
      <button type="button" aria-label="关闭交付物面板" @click="emit('close')">×</button>
    </header>

    <div class="deliverables-panel__body">
      <section v-if="pendingApprovals" class="approval-summary">
        <span aria-hidden="true">!</span>
        <div><b>{{ pendingApprovals }} 项待确认</b><small>完成确认后任务将继续执行</small></div>
      </section>

      <section v-if="outputFiles.length" class="deliverable-section">
        <div class="deliverable-section__title"><b>生成文件</b><small>{{ outputFiles.length }}</small></div>
        <button v-for="file in outputFiles" :key="file.id" type="button" class="deliverable-item" @click="emit('select', file)">
          <span>{{ fileKindLabel(file).slice(0, 2) }}</span>
          <div><b>{{ file.name }}</b><small>{{ [fileKindLabel(file), formatFileSize(file.size)].filter(Boolean).join(' · ') }}</small></div>
          <i aria-hidden="true">›</i>
        </button>
      </section>

      <section v-if="inputFiles.length" class="deliverable-section">
        <div class="deliverable-section__title"><b>需求附件</b><small>{{ inputFiles.length }}</small></div>
        <button v-for="file in inputFiles" :key="file.id" type="button" class="deliverable-item" @click="emit('select', file)">
          <span>{{ fileKindLabel(file).slice(0, 2) }}</span>
          <div><b>{{ file.name }}</b><small>{{ [fileKindLabel(file), formatFileSize(file.size)].filter(Boolean).join(' · ') }}</small></div>
          <i aria-hidden="true">›</i>
        </button>
      </section>

      <div v-if="!files.length && !pendingApprovals" class="deliverables-empty">
        <span aria-hidden="true">◇</span>
        <b>暂无交付物</b>
        <p>附件、生成文件和待确认事项会集中显示在这里。</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.deliverables-panel { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; border-left: 0.0625rem solid var(--da-border-strong); background: var(--da-surface-1); box-shadow: -1.5rem 0 4rem rgb(0 0 0 / 18%); animation: deliverables-enter 200ms ease-out; }
.deliverables-panel > header { display: flex; min-height: 3.75rem; align-items: center; justify-content: space-between; gap: var(--da-space-4); padding: 0 var(--da-space-4); border-bottom: 0.0625rem solid var(--da-border); }
.deliverables-panel > header > div { display: grid; gap: 0.125rem; }
.deliverables-panel > header small { color: var(--da-brand-cyan); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.625rem; font-weight: 700; letter-spacing: 0.1em; }
.deliverables-panel > header b { color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); }
.deliverables-panel > header button { display: grid; width: 2rem; height: 2rem; padding: 0; place-items: center; border: 0; border-radius: var(--da-radius-sm); color: var(--da-text-muted); background: transparent; cursor: pointer; font-size: 1.25rem; }
.deliverables-panel > header button:hover { color: var(--da-text-emphasis); background: var(--da-surface-3); }
.deliverables-panel__body { min-height: 0; overflow: auto; padding: var(--da-space-4); }
.approval-summary { display: flex; align-items: center; gap: var(--da-space-3); margin-bottom: var(--da-space-5); padding: var(--da-space-3); border: 0.0625rem solid color-mix(in srgb, var(--da-accent-yellow) 30%, var(--da-border)); border-radius: var(--da-radius-md); background: color-mix(in srgb, var(--da-accent-yellow) 5%, var(--da-surface-2)); }
.approval-summary > span { display: grid; width: 1.75rem; height: 1.75rem; flex: 0 0 auto; place-items: center; border-radius: 50%; color: var(--da-surface-0); background: var(--da-accent-yellow); font-weight: 700; }
.approval-summary div { display: grid; gap: 0.125rem; }
.approval-summary b { color: var(--da-text-emphasis); font-size: var(--da-font-size-sm); }
.approval-summary small { color: var(--da-text-muted); font-size: var(--da-font-size-xs); }
.deliverable-section { display: grid; gap: var(--da-space-2); margin-bottom: var(--da-space-6); }
.deliverable-section__title { display: flex; align-items: center; justify-content: space-between; padding-inline: var(--da-space-1); }
.deliverable-section__title b { color: var(--da-text-secondary); font-size: var(--da-font-size-xs); font-weight: 600; }
.deliverable-section__title small { color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.deliverable-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--da-space-3); width: 100%; padding: var(--da-space-3); border: 0.0625rem solid var(--da-border); border-radius: var(--da-radius-md); color: var(--da-text-muted); background: var(--da-surface-2); cursor: pointer; text-align: left; transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease; }
.deliverable-item:hover { border-color: var(--da-border-focus); background: var(--da-surface-3); transform: translateX(-0.125rem); }
.deliverable-item > span { display: grid; width: 2rem; height: 2rem; place-items: center; border: 0.0625rem solid var(--da-border-strong); border-radius: var(--da-radius-sm); color: var(--da-accent-orange); font-size: 0.6875rem; font-weight: 700; }
.deliverable-item > div { display: grid; min-width: 0; gap: 0.125rem; }
.deliverable-item b { overflow: hidden; color: var(--da-text-primary); font-size: var(--da-font-size-sm); text-overflow: ellipsis; white-space: nowrap; }
.deliverable-item small { color: var(--da-text-subtle); font-size: var(--da-font-size-xs); }
.deliverable-item i { color: var(--da-text-subtle); font-size: 1.25rem; font-style: normal; }
.deliverables-empty { display: grid; min-height: 18rem; place-content: center; justify-items: center; gap: var(--da-space-2); color: var(--da-text-muted); text-align: center; }
.deliverables-empty > span { color: var(--da-brand-cyan); font-size: 1.75rem; }
.deliverables-empty b { color: var(--da-text-primary); }
.deliverables-empty p { max-width: 18rem; margin: 0; font-size: var(--da-font-size-xs); line-height: 1.6; }
@keyframes deliverables-enter { from { opacity: 0; transform: translateX(0.75rem); } }
@media (prefers-reduced-motion: reduce) { .deliverables-panel { animation: none; } .deliverable-item { transition: none; } }
</style>
