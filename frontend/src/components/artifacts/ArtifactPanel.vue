<script setup lang="ts">
import { computed } from 'vue'
import { artifactController } from '../../artifacts/store'
import type { ArtifactReference } from '../../artifacts/types'
import SpecArtifactView from './SpecArtifactView.vue'

const artifact = computed(() => artifactController.state.artifact)

function updateVersion(version: string) {
  const current = artifactController.state.artifact
  if (!current) return
  artifactController.state.artifact = { ...current, version }
}

function titleOf(value: ArtifactReference) {
  return value.title || value.artifactId
}
</script>

<template>
  <aside v-if="artifactController.state.open && artifact" class="artifact-panel">
    <header class="artifact-panel__header">
      <div class="artifact-panel__title">
        <span>{{ artifact.artifactType }}</span>
        <strong>{{ titleOf(artifact) }}</strong>
      </div>
      <div class="artifact-panel__meta">
        <span v-if="artifact.version">{{ artifact.version }}</span>
        <span v-if="artifact.status">{{ artifact.status }}</span>
        <button type="button" title="关闭" aria-label="关闭" @click="artifactController.close">×</button>
      </div>
    </header>

    <div class="artifact-panel__body">
      <SpecArtifactView
        v-if="artifact.artifactType === 'spec'"
        :artifact="artifact"
        @version-changed="updateVersion"
      />

      <section v-else class="artifact-panel__placeholder">
        <div class="artifact-panel__placeholder-icon">A</div>
        <strong>{{ artifact.title }}</strong>
        <p v-if="artifact.summary">{{ artifact.summary }}</p>
        <dl>
          <div><dt>类型</dt><dd>{{ artifact.artifactType }}</dd></div>
          <div><dt>ID</dt><dd>{{ artifact.artifactId }}</dd></div>
          <div v-if="artifact.version"><dt>版本</dt><dd>{{ artifact.version }}</dd></div>
        </dl>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.artifact-panel{min-width:0;width:min(58vw,860px);height:100%;display:flex;flex-direction:column;border-left:1px solid var(--da-border);background:var(--da-surface-0);color:var(--da-text-primary)}
.artifact-panel__header{min-height:62px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 16px;border-bottom:1px solid var(--da-border)}
.artifact-panel__title{min-width:0;display:flex;flex-direction:column;gap:2px}
.artifact-panel__title span{text-transform:uppercase;color:var(--da-text-subtle);font-size:10px;letter-spacing:.08em}
.artifact-panel__title strong{overflow:hidden;color:var(--da-text-primary);font-size:14px;font-weight:640;text-overflow:ellipsis;white-space:nowrap}
.artifact-panel__meta{display:flex;align-items:center;gap:9px;color:var(--da-text-muted);font-size:11px}
.artifact-panel__meta button{width:30px;height:30px;border:0;border-radius:7px;background:transparent;color:var(--da-text-muted);font-size:20px;line-height:1;cursor:pointer}
.artifact-panel__meta button:hover{background:var(--da-surface-2);color:var(--da-text-primary)}
.artifact-panel__body{min-height:0;display:flex;flex:1;padding:16px;overflow:hidden}
.artifact-panel__placeholder{width:100%;align-self:flex-start;padding:28px;border:1px dashed var(--da-border);border-radius:12px;color:var(--da-text-muted)}
.artifact-panel__placeholder-icon{width:42px;height:42px;display:grid;place-items:center;margin-bottom:14px;border-radius:10px;background:var(--da-surface-2);color:var(--da-text-primary);font-weight:700}
.artifact-panel__placeholder strong{display:block;margin-bottom:8px;color:var(--da-text-primary);font-size:15px}
.artifact-panel__placeholder p{margin:0 0 18px;line-height:1.6}
.artifact-panel__placeholder dl{display:grid;gap:8px;margin:0}
.artifact-panel__placeholder dl>div{display:grid;grid-template-columns:56px minmax(0,1fr);gap:8px}
.artifact-panel__placeholder dt{color:var(--da-text-subtle)}
.artifact-panel__placeholder dd{min-width:0;margin:0;overflow:hidden;color:var(--da-text-secondary);text-overflow:ellipsis;white-space:nowrap}
@media(max-width:980px){.artifact-panel{width:50%}}
</style>
