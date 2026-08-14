<script setup lang="ts">
import { useFrontendTool, useRenderTool } from '@copilotkit/vue/v2'
import { h } from 'vue'
import { z } from 'zod'
import { genUIRegistry } from '../genui/registry'
import { workspaceController } from '../workspace/store'
import GenericRenderer from './genui/GenericRenderer.vue'
import ToolStatus from './genui/ToolStatus.vue'
import WorkspaceToolStatus from './genui/WorkspaceToolStatus.vue'

const renderWorkspaceStatus = (props: any) => h(WorkspaceToolStatus, {
  ...props,
  parameters: props.args,
})

const syncWorkspaceState = (agent: any) => {
  const workspace = workspaceController.snapshot()
  if (!workspace) return
  agent.setState({ ...(agent.state ?? {}), workspace })
}

const workspaceWidgetSchema = z.object({
  id: z.string().describe('Stable widget id used for later updates'),
  component: z.string().describe('Registered component name, for example ui.markdown, ui.kpis or ui.lineChart'),
  props: z.record(z.string(), z.unknown()).default({}),
  colSpan: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(12)]).optional(),
  minHeight: z.number().optional(),
})

useFrontendTool({
  name: 'workspace.render',
  description: 'Replace the main Data Agent visual workspace. Use this when a user asks for a dashboard, overview, multi-part analysis, or when the visual composition should materially change. Prefer registered ui.* components and compose them into a 12-column grid.',
  parameters: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    widgets: z.array(workspaceWidgetSchema),
  }),
  handler: async ({ title, subtitle, widgets }, { agent }) => {
    workspaceController.replace({ title, subtitle, widgets })
    syncWorkspaceState(agent)
    return `Workspace rendered with ${widgets.length} modules.`
  },
  render: renderWorkspaceStatus,
})

useFrontendTool({
  name: 'workspace.upsert',
  description: 'Add a new visual module or update an existing module in the main Data Agent workspace without replacing other modules.',
  parameters: z.object({ widget: workspaceWidgetSchema }),
  handler: async ({ widget }, { agent }) => {
    workspaceController.upsert(widget)
    syncWorkspaceState(agent)
    return `Workspace module ${widget.id} updated.`
  },
  render: renderWorkspaceStatus,
})

useFrontendTool({
  name: 'workspace.remove',
  description: 'Remove a visual module from the main Data Agent workspace by its stable widget id.',
  parameters: z.object({ id: z.string() }),
  handler: async ({ id }, { agent }) => {
    workspaceController.remove(id)
    syncWorkspaceState(agent)
    return `Workspace module ${id} removed.`
  },
  render: renderWorkspaceStatus,
})

const agentStatusSchema = z.enum(['pending', 'running', 'done', 'error', 'waiting'])
const agentNodeSchema = z.object({
  id: z.string(), name: z.string(), role: z.string().optional(), task: z.string().optional(),
  status: agentStatusSchema.optional(), progress: z.number().optional(), durationMs: z.number().optional(),
  summary: z.string().optional(), tools: z.array(z.string()).optional(), output: z.string().optional(),
})

useFrontendTool({
  name: 'workspace.agents',
  description: 'Render or refresh the multi-agent orchestration area in the main workspace. Use it when an analysis is delegated to multiple sub agents. It updates topology, timeline and live activity together.',
  parameters: z.object({
    orchestrator: agentNodeSchema.optional(), agents: z.array(agentNodeSchema).default([]),
    timeline: z.array(z.object({ id:z.string(), name:z.string(), label:z.string().optional(), startMs:z.number(), durationMs:z.number(), status:agentStatusSchema.optional() })).optional(),
    activities: z.array(z.object({ id:z.string().optional(), time:z.string().optional(), agent:z.string(), message:z.string(), status:z.enum(['info','running','success','warning','error']).optional(), meta:z.string().optional() })).optional(),
  }),
  handler: async ({ orchestrator, agents, timeline, activities }, { agent }) => {
    workspaceController.upsert({ id:'agent-graph', component:'ui.agentGraph', colSpan:8, minHeight:350, props:{ title:'智能分析编排', orchestrator, agents } })
    workspaceController.upsert({ id:'agent-activity', component:'ui.agentActivity', colSpan:4, minHeight:350, props:{ title:'实时协作', items:activities || [] } })
    if (timeline?.length) {
      const totalMs = Math.max(...timeline.map(item => item.startMs + item.durationMs), 1)
      workspaceController.upsert({ id:'agent-timeline', component:'ui.agentTimeline', colSpan:12, props:{ title:'并行执行时间线', totalMs, items:timeline } })
    }
    syncWorkspaceState(agent)
    return `Multi-agent workspace refreshed: ${agents.length} sub agents.`
  },
  render: renderWorkspaceStatus,
})

for (const item of genUIRegistry) {
  useRenderTool({ name: item.name, parameters: item.schema, render: item.component })
}

useRenderTool({
  name: 'render_ui',
  parameters: z.object({ component: z.string(), props: z.record(z.string(), z.unknown()).default({}) }),
  render: (props: any) => h(GenericRenderer, props),
})

useRenderTool({ name: '*', render: ToolStatus })
</script>
<template><slot /></template>
