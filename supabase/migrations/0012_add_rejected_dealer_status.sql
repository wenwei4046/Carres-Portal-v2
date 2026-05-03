-- 0012_add_rejected_dealer_status.sql
-- Adds 'rejected' status for dealers whose new_dealer approval was declined.
-- Postgres rule: enum value addition must be in its own migration; cannot be used
-- in the same transaction it was created. 0014 (approval_decide extension) uses
-- this value, so 0012 must run first.
alter type dealer_status add value if not exists 'rejected';
