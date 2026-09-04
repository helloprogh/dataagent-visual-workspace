# 区域销售分析看板 — 实施计划（approval-demo）

> 前置状态：Spec（spec-approval-demo.md）已批准，批准选项 = 批准并继续。

## 1. 里程碑
- M1 数据接入完成（D2）：ERP/CRM ODS 表上线，T+1 调度跑通。
- M2 数仓建模完成（D5）：DWD/DWS + 指标字典评审通过。
- M3 看板 Beta（D9）：KPI/地图/趋势/明细可演示。
- M4 功能完备（D11）：权限+导出+周报推送完成。
- M5 上线（D13）：灰度 1 大区 -> 全量。

## 2. 任务分解
| ID | 任务 | 负责人 | 依赖 | 产出 | 验收 |
|---|---|---|---|---|---|
| T1 | 确认 ERP.sales_order、return_order、CRM.receipt 表结构 | 数据工程 | - | 表结构文档 | 字段映射评审通过 |
| T2 | ODS 层 + T+1 调度（02:00/03:00）| 数据工程 | T1 | 调度任务 | 连续 3 天成功 |
| T3 | DWD/DWS 建模 + 指标字典 | 数据工程 | T2 | 宽表 + 字典 | A1 口径复核通过 |
| T4 | 看板前端：筛选+KPI+趋势+地图 | 前端/后端 | T3 | Beta 看板 | A2 <3s P90 |
| T5 | 下钻 + 同比环比 + 异常标红 | 前端/后端 | T4 | 对比功能 | A1/A3 通过 |
| T6 | 明细表分页排序导出 CSV | 后端 | T4 | 导出功能 | A5 通过 |
| T7 | 权限隔离 + 周报邮件 PDF | 后端 | T4 | 权限+推送 | A3/A6 通过 |
| T8 | UAT + 性能 + 监控告警 + 灰度上线 | 全员 | T5-T7 | 上线报告 | A1-A6 全通过 |

## 3. 数据与接口
- ODS：`ods_erp_sales_order`、`ods_erp_return_order`、`ods_crm_receipt`。
- DWS：`dws_region_sales_daily`（region/province/city/date/channel/category 聚合）。
- 接口：`GET /api/sales/kpi`、`GET /api/sales/trend`、`GET /api/sales/detail?page&sort`。
- 导出：`POST /api/sales/export` 异步生成 CSV。

## 4. 风险与应对
- R1 口径分歧 -> 以 Spec 第 5 节为准，每日对账 job。
- R2 T+1 延迟 -> 失败重试 3 次 + 短信告警，SLA 08:00 前恢复。
- R3 性能不达标 -> 预聚合 + 缓存，地图瓦片懒加载。
- R4 权限越权 -> 行级权限单元测试 + 安全评审。

## 5. 验证计划（映射 Spec 验收）
- A1-A6 逐项在 UAT 环境执行，SQL 复核脚本存 `qa/`。
- 性能测试数据集 100 万订单，记录 P50/P90。
- 上线检查表：调度、权限、导出、邮件、监控大盘。

## 6. 下一步
- 确认人力排期，启动 T1。
- 本计划由 Spec 审批通过后自动生成，状态：Spec 已批准、实施计划已生成。
