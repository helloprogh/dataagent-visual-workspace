# demo-sales 数据应用设计 (02-design)

> 应用标识: demo-sales | 阶段: Solution Design | 状态: 待审批（mock）

## 1. 架构
- ODS: `ods_erp_sales_order` / `ods_erp_return_order` / `ods_crm_receipt`
- DWD: `dwd_sales_order_wide`（订单宽表，统一口径）
- DWS: `dws_region_sales_daily`（region/province/city/date/channel/category 聚合）
- 服务: `GET /api/sales/kpi|trend|detail` + `POST /api/sales/export`
- 前端: KPI + 趋势 + 区域对比 + 明细 + 预警

## 2. 模型要点
- 日切点 Asia/Shanghai 00:00，货币 CNY
- 区域缺失映射进入“待认领”，退货在退款日单独扣减
- T+1 调度 02:00/03:00，失败重试 3 次 + 告警

## 3. 接口
- `GET /api/sales/kpi?region&from&to`
- `GET /api/sales/trend?region&granularity=day|week|month`
- `GET /api/sales/detail?page&sort`
- `POST /api/sales/export` 异步 CSV（UTF-8 with BOM）

## 4. 验收映射
A1 口径复核 -> qa/sql 复核脚本；A2 P90<3s -> 预聚合+缓存；A3 权限 -> 行级拦截器。

## 5. 下一步
审批通过后进入 Development，需生成 execution-plan + transform.sql + metric-contract。
