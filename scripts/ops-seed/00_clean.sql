-- 00_clean.sql  Wipe wrong-file product_skus + Carres Klang stock (Jess 2026-05-19)
BEGIN;
DELETE FROM stock_movements WHERE warehouse_id='00000000-0000-0000-0000-000000000c03'::uuid;
DELETE FROM stock_balances  WHERE warehouse_id='00000000-0000-0000-0000-000000000c03'::uuid;
DELETE FROM product_skus;
DELETE FROM product_models;
COMMIT;