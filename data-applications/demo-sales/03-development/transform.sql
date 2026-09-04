-- demo-sales transform.sql (mock, T+1)
-- ODS -> DWD -> DWS，口径：含税实付，剔除取消/关闭，退货单独扣减
CREATE TABLE IF NOT EXISTS dwd_sales_order_wide AS
SELECT
  order_id,
  CAST(order_date AS DATE) AS order_date,
  COALESCE(region, '待认领') AS region,
  province, city, channel, category,
  paid_amount, return_amount, receipt_amount
FROM ods_erp_sales_order
WHERE paid_amount > 0
  AND order_status = 'APPROVED'
  AND is_test_order = FALSE;

-- DWS daily aggregation
CREATE TABLE IF NOT EXISTS dws_region_sales_daily AS
SELECT
  region, province, city,
  order_date AS sale_date, channel, category,
  SUM(paid_amount) - SUM(COALESCE(return_amount, 0)) AS sales_amount,
  COUNT(DISTINCT order_id) AS order_cnt,
  SUM(receipt_amount) AS receipt_amount
FROM dwd_sales_order_wide
GROUP BY region, province, city, order_date, channel, category;
