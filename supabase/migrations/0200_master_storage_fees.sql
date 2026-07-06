-- 0200_master_storage_fees
--
-- 2990s-style Master import → per-order storage fees (Jess 2026-07-06). Jess
-- hand-computes each order's storage fee in the Master's "MS/BF Storage Fees"
-- and "SOF Storage Fees" columns; the import (POST /operation/orders/
-- import-stock-eta) writes them here. The Storage panel PREFERS these over the
-- auto computeStorageFee (a manual storage_fee_override still wins), and a
-- non-null fee auto-marks the order as storage-incurred (the collect gate).
--
-- Additive + nullable → zero behaviour change until an import populates them.
-- READ-only on the generic control PUT (import endpoint writes them). RLS is
-- unchanged (ops_order_control already carries the operation/principal policies).

alter table ops_order_control
  add column if not exists storage_fee_msbf numeric(12,2),
  add column if not exists storage_fee_sof  numeric(12,2);

comment on column ops_order_control.storage_fee_msbf is
  'MS/BF storage fee imported from the Master "MS/BF Storage Fees" column (RM); null = not imported (migration 0200).';
comment on column ops_order_control.storage_fee_sof is
  'Sofa storage fee imported from the Master "SOF Storage Fees" column (RM); null = not imported (migration 0200).';
