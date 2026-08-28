<script setup lang="ts">
import { computed } from 'vue'
type TimelineStatus='pending'|'running'|'done'|'error'|'waiting'
type TimelineItem={id:string;name:string;status?:TimelineStatus;startMs:number;durationMs:number;label?:string}
const props=defineProps<{title?:string;totalMs?:number;items?:TimelineItem[]}>()
const range=computed(()=>Math.max(props.totalMs||0,...(props.items||[]).map(item=>item.startMs+item.durationMs),1))
const ticks=computed(()=>[0,.25,.5,.75,1].map(value=>({value,label:`${(range.value*value/1000).toFixed(value===0?0:1)}s`})))
const left=(item:TimelineItem)=>`${Math.min(100,item.startMs/range.value*100)}%`
const width=(item:TimelineItem)=>`${Math.max(2.5,Math.min(100-item.startMs/range.value*100,item.durationMs/range.value*100))}%`
const statusLabel=(status?:TimelineStatus)=>({pending:'待执行',running:'执行中',done:'已完成',error:'异常',waiting:'等待中'} as Record<string,string>)[status||'pending']
</script>
<template><section class="gen-card agent-timeline-card"><div class="gen-title-row agent-module-head"><div><span class="eyebrow">并行执行</span><span class="gen-title">{{ title || 'Agent 时间线' }}</span></div><span class="timeline-total">总计 {{ (range / 1000).toFixed(1) }}s</span></div><div class="timeline-axis"><span v-for="tick in ticks" :key="tick.value" :style="{ left: `${tick.value * 100}%` }">{{ tick.label }}</span></div><div class="agent-timeline-list"><div v-for="item in items || []" :key="item.id" class="agent-timeline-row"><div class="timeline-agent-name"><i :class="item.status || 'pending'"></i><span>{{ item.name }}</span></div><div class="timeline-track"><i v-for="tick in ticks" :key="tick.value" class="timeline-gridline" :style="{ left: `${tick.value * 100}%` }"></i><div class="timeline-segment" :class="item.status || 'pending'" :style="{ left: left(item), width: width(item) }"><span>{{ item.label || statusLabel(item.status) }}</span><time>{{ (item.durationMs / 1000).toFixed(1) }}s</time></div></div></div></div></section></template>
