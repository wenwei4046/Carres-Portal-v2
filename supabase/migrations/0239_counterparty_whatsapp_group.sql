-- 0239_counterparty_whatsapp_group.sql
-- WhatsApp group link per counterparty, so the bulk Remind / Chase action can
-- open the right group in one click (Jess 2026-07-19). Additive + nullable; no
-- RLS change (both tables' existing SELECT policies already expose all columns;
-- writes stay operation/principal via the existing policies). Seeds the 9 group
-- links Jess supplied — the rest stay null ("group not set — copy & paste").

alter table suppliers          add column if not exists whatsapp_group_url text;
alter table delivery_partners  add column if not exists whatsapp_group_url text;

-- Suppliers (factories)
update suppliers set whatsapp_group_url = 'https://chat.whatsapp.com/LawfIaE6PuzE6O8XORdXdk?s=cl&p=i&ilr=4' where id = '00000000-0000-0000-0000-0000000000e1'; -- Ohana
update suppliers set whatsapp_group_url = 'https://chat.whatsapp.com/DG4i8MErWH99xHJoWK4saa?s=cl&p=i&ilr=4' where id = '00000000-0000-0000-0000-0000000000e2'; -- Nice Future
update suppliers set whatsapp_group_url = 'https://chat.whatsapp.com/GdvLgSQsORRLOS6iwahNAh?s=cl&p=i&ilr=4' where id = '838f325a-92e2-4db4-a11a-699c207b6742'; -- Armani
update suppliers set whatsapp_group_url = 'https://chat.whatsapp.com/EFQg7cge1ZYHcz4Gu5Ma7z?s=cl&p=i&ilr=4' where id = 'fc99b9a9-b1b3-4455-882f-ffb6f9a91efa'; -- Dorsettloft
update suppliers set whatsapp_group_url = 'https://chat.whatsapp.com/LT6xx8cgI7A000oGFRrG3w?s=cl&p=i&ilr=4' where id = '1a3efa9a-d1e6-4a3c-b41a-3acd5ea18aa5'; -- Todern

-- Delivery partners
update delivery_partners set whatsapp_group_url = 'https://chat.whatsapp.com/EnQo9R7ArEBJclQMl9KOmB?s=cl&p=i&ilr=4' where id = 'c7afcb60-f126-4fb3-b657-4cfd9b4cd4c3'; -- NETS
update delivery_partners set whatsapp_group_url = 'https://chat.whatsapp.com/J7gBAnePgjCBZy7ybpnvnn?s=cl&p=i&ilr=4' where id = '7d8d4030-51f2-45b0-8238-b86268c1bcc4'; -- AL
update delivery_partners set whatsapp_group_url = 'https://chat.whatsapp.com/DxOCcTrVTipEINTCLshEto?s=cl&p=i&ilr=4' where id = '313403d4-e64d-47be-8159-d4ecb6e27d2c'; -- TEOW
update delivery_partners set whatsapp_group_url = 'https://chat.whatsapp.com/LiZoW2pG3dAFAiL0F3mj0Z?s=cl&p=i&ilr=4' where id = 'cbff4520-ca7c-456b-be1c-6961704705d4'; -- TT
