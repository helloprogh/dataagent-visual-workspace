# demo-sales 数据字典 (mock)

| 表 | 字段 | 类型 | 说明 |
|---|---|---|---|
| dwd_sales_order_wide | order_id | STRING | 主键，去重 |
|  | order_date | DATE | 订单日期，Asia/Shanghai |
|  | region / province / city | STRING | 区域三级，缺失=待认领 |
|  | channel | STRING | 线上/线下/经销 |
|  | category | STRING | 品类 |
|  | paid_amount | DECIMAL(12,2) | 含税实付，不含退款 |
|  | return_amount | DECIMAL(12,2) | 退款日单独扣减 |
|  | receipt_amount | DECIMAL(12,2) | 回款额，T+1 03:00 |
| dws_region_sales_daily | region/province/city/date/channel/category | STRING/DATE | 聚合维度 |
|  | sales_amount | DECIMAL(14,2) | SUM(paid_amount)-SUM(return_amount) |
|  | order_cnt | BIGINT | COUNT(DISTINCT order_id) |
|  | target_amount | DECIMAL(14,2) | 月度目标拆分到日 |
| dim_region | province/city -> region | STRING | 区域映射表 |

时区 UTC+8，日切 00:00，金额 2 位小数，百分比 1 位小数。
