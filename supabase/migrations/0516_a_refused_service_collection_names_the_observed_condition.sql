-- A refused Service Case collection is a Logistics observation before loading.
-- It must name the factual condition; custody and Stock do not move.
create or replace function validate_arrival_collection_refusal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  reason text := new.payload->'collection_review'->>'failed_reason';
begin
  if new.kind = 'collection_refused'
     and (reason is null or reason not in (
       'stain', 'liquid_odour', 'pests', 'saliva_unsanitary',
       'tear_burn_cut', 'customer_damage', 'wrong_item', 'unsafe_unwrapped'
     )) then
    raise exception 'choose the observed condition that stopped collection'
      using errcode = '22023';
  end if;
  return new;
end
$$;

drop trigger if exists arrival_collection_refusal_has_reason
  on arrival_source_events;
create trigger arrival_collection_refusal_has_reason
before insert or update of kind, payload on arrival_source_events
for each row execute function validate_arrival_collection_refusal();
