import { z } from 'zod'
import MetricCard from '../components/genui/MetricCard.vue'
import KpiGroup from '../components/genui/KpiGroup.vue'
import DataTable from '../components/genui/DataTable.vue'
import BarChart from '../components/genui/BarChart.vue'
import LineChart from '../components/genui/LineChart.vue'
import AreaChart from '../components/genui/AreaChart.vue'
import DonutChart from '../components/genui/DonutChart.vue'
import SqlPanel from '../components/genui/SqlPanel.vue'
import InsightList from '../components/genui/InsightList.vue'
import AnalysisPlan from '../components/genui/AnalysisPlan.vue'
import FieldProfile from '../components/genui/FieldProfile.vue'
import ExecutiveSummary from '../components/genui/ExecutiveSummary.vue'
import FunnelChart from '../components/genui/FunnelChart.vue'
import RootCause from '../components/genui/RootCause.vue'
import DataQuality from '../components/genui/DataQuality.vue'
import QueryTrace from '../components/genui/QueryTrace.vue'
import SemanticModel from '../components/genui/SemanticModel.vue'
import ForecastCard from '../components/genui/ForecastCard.vue'
import Heatmap from '../components/genui/Heatmap.vue'
import AgentGraph from '../components/genui/AgentGraph.vue'
import AgentTimeline from '../components/genui/AgentTimeline.vue'
import AgentActivity from '../components/genui/AgentActivity.vue'
import MarkdownPanel from '../components/genui/MarkdownPanel.vue'
import type { GenUIEntry } from './types'

const metricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  delta: z.number().optional(),
  unit: z.string().optional(),
  description: z.string().optional(),
})

const seriesItemSchema = z.object({ label: z.string(), value: z.number() })

export const genUIRegistry: GenUIEntry[] = [
  { name:'ui.markdown', title:'Markdown 内容', description:'展示模型动态生成的标题、说明、清单和交付文档', component:MarkdownPanel, schema:z.object({ title:z.string().optional(), content:z.string() }) },
  { name:'ui.agentGraph', title:'多 Agent 编排', description:'展示主 Agent 与子 Agent 的协作拓扑、状态、进度、工具与输出', component:AgentGraph, schema:z.object({ title:z.string().optional(), orchestrator:z.object({id:z.string(),name:z.string(),role:z.string().optional(),task:z.string().optional(),status:z.enum(['pending','running','done','error','waiting']).optional(),progress:z.number().optional(),durationMs:z.number().optional(),summary:z.string().optional(),tools:z.array(z.string()).optional(),output:z.string().optional()}).optional(), agents:z.array(z.object({id:z.string(),name:z.string(),role:z.string().optional(),task:z.string().optional(),status:z.enum(['pending','running','done','error','waiting']).optional(),progress:z.number().optional(),durationMs:z.number().optional(),summary:z.string().optional(),tools:z.array(z.string()).optional(),output:z.string().optional()})).optional() }) },
  { name:'ui.agentTimeline', title:'Agent 并行时间线', description:'展示多个子 Agent 的并行/串行执行时序和耗时', component:AgentTimeline, schema:z.object({ title:z.string().optional(), totalMs:z.number().optional(), items:z.array(z.object({id:z.string(),name:z.string(),label:z.string().optional(),startMs:z.number(),durationMs:z.number(),status:z.enum(['pending','running','done','error','waiting']).optional()})).optional() }) },
  { name:'ui.agentActivity', title:'Agent 实时活动', description:'展示子 Agent 的实时任务事件、状态变化和关键输出', component:AgentActivity, schema:z.object({ title:z.string().optional(), items:z.array(z.object({id:z.string().optional(),time:z.string().optional(),agent:z.string(),message:z.string(),status:z.enum(['info','running','success','warning','error']).optional(),meta:z.string().optional()})).optional() }) },
  {
    name: 'ui.executiveSummary',
    title: '交付摘要',
    description: '聚合需求范围、方案结论、关键进展、风险和交付标签',
    component: ExecutiveSummary,
    schema: z.object({
      title: z.string().optional(),
      summary: z.string(),
      confidence: z.number().min(0).max(100).optional(),
      tags: z.array(z.string()).optional(),
      highlights: z.array(z.object({
        label: z.string(), value: z.string(), tone: z.enum(['positive', 'negative', 'neutral']).optional(),
      })).optional(),
    }),
  },
  {
    name: 'ui.metric',
    title: '指标卡',
    description: '展示单个核心 KPI',
    component: MetricCard,
    schema: z.object({ title: z.string(), value: z.union([z.string(), z.number()]), delta: z.number().optional(), unit: z.string().optional(), description: z.string().optional() }),
  },
  {
    name: 'ui.kpis',
    title: '状态概览',
    description: '并排展示需求开发与数据交付的关键状态',
    component: KpiGroup,
    schema: z.object({ title: z.string().optional(), items: z.array(metricSchema) }),
  },
  {
    name: 'ui.table',
    title: '数据表格',
    description: '展示结构化查询结果',
    component: DataTable,
    schema: z.object({ title: z.string().optional(), columns: z.array(z.object({ key: z.string(), label: z.string() })), rows: z.array(z.record(z.string(), z.unknown())) }),
  },
  {
    name: 'ui.barChart',
    title: '分类对比',
    description: '对比分类数据和贡献',
    component: BarChart,
    schema: z.object({ title: z.string().optional(), items: z.array(seriesItemSchema) }),
  },
  {
    name: 'ui.lineChart',
    title: '趋势折线图',
    description: '展示时间序列和趋势。必须使用 points: [{ label, value }]，不要使用 Chart.js 的 data/datasets/options 格式',
    component: LineChart,
    schema: z.object({ title: z.string().optional(), unit: z.string().optional(), points: z.array(seriesItemSchema) }),
  },
  {
    name: 'ui.areaChart',
    title: '区域趋势图',
    description: '展示带面积填充的时间序列趋势。必须使用 points: [{ label, value }]，不要使用 Chart.js 的 data/datasets/options 格式',
    component: AreaChart,
    schema: z.object({ title: z.string().optional(), unit: z.string().optional(), points: z.array(seriesItemSchema) }),
  },
  {
    name: 'ui.donutChart',
    title: '占比环图',
    description: '展示构成和占比',
    component: DonutChart,
    schema: z.object({ title: z.string().optional(), centerText: z.string().optional(), items: z.array(seriesItemSchema) }),
  },
  {
    name: 'ui.funnel',
    title: '转化漏斗',
    description: '展示多阶段转化和流失',
    component: FunnelChart,
    schema: z.object({
      title: z.string().optional(), unit: z.string().optional(),
      stages: z.array(z.object({ label: z.string(), value: z.number(), conversion: z.number().optional() })),
    }),
  },
  {
    name: 'ui.heatmap',
    title: '热力分析',
    description: '展示二维维度上的强度分布',
    component: Heatmap,
    schema: z.object({
      title: z.string().optional(), unit: z.string().optional(),
      xLabels: z.array(z.string()), yLabels: z.array(z.string()), values: z.array(z.array(z.number())),
    }),
  },
  {
    name: 'ui.rootCause',
    title: '智能归因',
    description: '展示正负贡献因素和主要原因',
    component: RootCause,
    schema: z.object({
      title: z.string().optional(), target: z.string().optional(),
      factors: z.array(z.object({ label: z.string(), contribution: z.number(), description: z.string().optional() })),
    }),
  },
  {
    name: 'ui.forecast',
    title: '趋势预测',
    description: '展示实际与预测走势、置信度和预测窗口',
    component: ForecastCard,
    schema: z.object({
      title: z.string().optional(), metric: z.string().optional(), value: z.union([z.string(), z.number()]).optional(),
      change: z.number().optional(), horizon: z.string().optional(), confidence: z.number().optional(),
      points: z.array(z.object({ label: z.string(), actual: z.number().optional(), forecast: z.number().optional() })).optional(),
    }),
  },
  {
    name: 'ui.insights',
    title: '问题与结论清单',
    description: '展示待澄清事项、风险、变化与交付结论',
    component: InsightList,
    schema: z.object({
      title: z.string().optional(),
      items: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        severity: z.enum(['info', 'success', 'warning', 'danger']).optional(),
        metric: z.string().optional(),
      })),
    }),
  },
  {
    name: 'ui.analysisPlan',
    title: '交付计划',
    description: '展示 Specification、数据方案、数据集成、ETL 开发、治理验证与交付进度',
    component: AnalysisPlan,
    schema: z.object({
      title: z.string().optional(),
      steps: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        status: z.enum(['pending', 'running', 'done', 'error']).optional(),
      })),
    }),
  },
  {
    name: 'ui.queryTrace',
    title: 'Agent 执行链路',
    description: '展示需求澄清、Specification、数据方案、数据集成、ETL 开发、治理验证与交付链路',
    component: QueryTrace,
    schema: z.object({
      title: z.string().optional(), durationMs: z.number().optional(),
      steps: z.array(z.object({
        title: z.string(), description: z.string().optional(), durationMs: z.number().optional(),
        status: z.enum(['pending', 'running', 'done', 'error']).optional(),
        kind: z.enum(['intent', 'semantic', 'sql', 'execute', 'insight']).optional(),
      })),
    }),
  },
  {
    name: 'ui.sql',
    title: 'SQL 面板',
    description: '展示生成 SQL 和执行耗时',
    component: SqlPanel,
    schema: z.object({ title: z.string().optional(), sql: z.string(), dialect: z.string().optional(), durationMs: z.number().optional() }),
  },
  {
    name: 'ui.dataQuality',
    title: '数据质量',
    description: '展示可信评分与完整性、唯一性、及时性等质量维度',
    component: DataQuality,
    schema: z.object({
      title: z.string().optional(), score: z.number(), status: z.enum(['excellent', 'good', 'warning', 'critical']).optional(),
      dimensions: z.array(z.object({ label: z.string(), score: z.number(), note: z.string().optional() })).optional(),
    }),
  },
  {
    name: 'ui.fieldProfile',
    title: '字段画像',
    description: '展示字段类型、空值率、基数和样例',
    component: FieldProfile,
    schema: z.object({
      title: z.string().optional(),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        nullRate: z.number().optional(),
        distinctCount: z.number().optional(),
        sample: z.string().optional(),
      })),
    }),
  },
  {
    name: 'ui.semanticModel',
    title: '语义模型',
    description: '展示维度、度量、指标和底层数据源',
    component: SemanticModel,
    schema: z.object({
      title: z.string().optional(), model: z.string().optional(), description: z.string().optional(),
      dimensions: z.array(z.string()).optional(), measures: z.array(z.string()).optional(), metrics: z.array(z.string()).optional(), sources: z.array(z.string()).optional(),
    }),
  },
]

export const componentMap = Object.fromEntries(genUIRegistry.map(item => [item.name, item.component])) as Record<string, any>
