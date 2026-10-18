do $test$
declare c jsonb; made jsonb; rid uuid; cid uuid:='fffffff2-0000-4000-8000-000000000001'; key uuid:=gen_random_uuid(); proposal jsonb;
 dest public.purchasing_destinations%rowtype; sku text; stock uuid; stock_d uuid; buy_d public.purchase_demands%rowtype; changed_context jsonb;
 denied boolean; result jsonb; approval_scope jsonb; baseline_events jsonb; po_payload jsonb; created_po text; eta date;
begin
 select * into strict dest from public.purchasing_destinations where active and warehouse_id is not null order by id limit 1;
 select s.sku into strict sku from public.product_skus s join public.product_models m on m.id=s.model_id
  join public.purchasing_production_days p on p.supplier_id=s.supplier_id and p.category=m.category::text order by s.sku limit 1;
 select context into c from sc_fixture;
 c:=jsonb_set(jsonb_set(c,'{lines,0,sku}',to_jsonb(sku)),'{lines,0,allocations,0,destinationId}',to_jsonb(dest.id));
 c:=jsonb_set(c,'{lines,0,stockProposals}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'locationId',dest.warehouse_id,'destinationId',dest.id,'qty',1,'recipients',jsonb_build_array(jsonb_build_object('recipientId',c#>>'{recipients,0,id}','qty',1)))));
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009698","role":"authenticated","app_metadata":{"role":"operation"}}',true);
 insert into public.service_cases(id,case_no,customer_name,carres_action,what_affected,product_sku,customer_wants,evidence,created_by)
 values(cid,'TEST-SC-REMEDY','TEST customer','Replace two damaged goods','TEST exact goods',sku,array['replace'],
  jsonb_build_array(jsonb_build_object('slot','all_surfaces','path',cid||'/TEST.jpg','kind','photo','at',now(),'by',auth.uid(),'by_role','operation')),auth.uid());
 insert into storage.objects(bucket_id,name) values('service-case-evidence',cid||'/TEST.jpg');
 made:=public.purchasing_create_request_with_lines(p_purpose=>'service_case',p_destination_id=>dest.id,p_for_service_case_id=>cid,
  p_lines=>jsonb_build_array(jsonb_build_object('request_context',c,'submission_key',gen_random_uuid())),p_fulfilment_intent=>'concrete_need');
 rid:=(made->>'id')::uuid;
 insert into public.ops_stock_items(sku,warehouse_id,condition,status) values(sku,dest.warehouse_id,'new','free') returning id into stock;
 select id into strict stock_d from public.purchase_demands where request_id=rid and fulfilment_kind='stock_proposal';
 select * into strict buy_d from public.purchase_demands where request_id=rid and fulfilment_kind='purchase';
 proposal:=jsonb_build_object('key',key,'requestId',rid,'expectedRequestVersion',1,'affectedUnits','[]'::jsonb,'policy','TEST existing policy','policyVersion','TEST policy version','policyResult','eligible',
  'remedy','replace','movement','replace_first','charge','free','amount',null,'payer','','payerAcceptance',null,'reason','TEST replace exact two goods','evidence',jsonb_build_array(cid||'/TEST.jpg'));
 execute 'set local role authenticated';
 result:=public.service_case_remedy_propose(cid,proposal);
 if result->>'status'<>'pending' then raise exception 'proposal not pending'; end if;
 if (public.service_case_remedy_propose(cid,proposal)->>'replayed')::boolean is not true then raise exception 'submission retry duplicated'; end if;
 denied:=false;
 begin perform public.service_case_remedy_decide(cid,jsonb_build_object('approvalId',key,'status','approved','reason','')); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'unqualified Case approval admitted'; end if;
 denied:=false;
 begin update public.service_cases set remedy_approval_events='[]' where id=cid; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'browser forged Case history'; end if;
 execute 'reset role';
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009699","role":"authenticated","app_metadata":{"role":"principal"}}',true);
 denied:=false;
 begin perform public.approval_decide(key,'approved','TEST wrong door'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'generic approval door bypassed Case decision'; end if;
 perform public.purchasing_decide_request(rid,'approve',null,jsonb_build_object('expected_version',1,'review_scope',public._purchasing_context_review(rid),'request_context',c,'approved_distribution',null));
 select r.approval_scope into strict approval_scope from public.purchase_requests r where id=rid;
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009698","role":"authenticated","app_metadata":{"role":"operation"}}',true);
 denied:=false;
 begin perform public.purchasing_allocate_ready_units(stock_d,array[stock],'{}'::uuid[]); exception when invalid_parameter_value then denied:=true; end;
 if not denied or exists(select 1 from public.ops_stock_items where id=stock and status<>'free') then raise exception 'Purchasing approval alone committed SC stock'; end if;
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009699","role":"authenticated","app_metadata":{"role":"principal"}}',true);
 execute 'set local role authenticated';
 result:=public.service_case_remedy_decide(cid,jsonb_build_object('approvalId',key,'status','approved','reason','TEST reviewed exact goods'));
 if result->>'status'<>'approved' or (public.service_case_remedy_decide(cid,jsonb_build_object('approvalId',key,'status','approved','reason','TEST reviewed exact goods'))->>'replayed')::boolean is not true then raise exception 'qualified decision/retry failed'; end if;
 execute 'reset role';
 select remedy_approval_events into baseline_events from public.service_cases where id=cid;
 if jsonb_array_length(baseline_events)<>2 then raise exception 'approval history duplicated'; end if;
 perform public._purchasing_context_execution_admission(rid);
 denied:=false;
 begin
  delete from storage.objects where bucket_id='service-case-evidence' and name=cid||'/TEST.jpg';
  perform public._purchasing_context_execution_admission(rid);
 exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'missing approved file admitted execution'; end if;
 -- Procurement-only stock/buy changes use Purchasing reapproval, not a second
 -- vote on the unchanged Case remedy. Exercise its actual revision door.
 begin
  changed_context:=jsonb_set(jsonb_set(jsonb_set(c,'{lines,0,stockProposals}','[]'),'{lines,0,allocations,0,qty}','2'),'{lines,0,allocations,0,recipients,0,qty}','2');
  perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009698","role":"authenticated","app_metadata":{"role":"operation"}}',true);
  perform public.purchasing_resubmit_request(rid,dest.id,(c#>>'{recipients,0,deliveryDate}')::date,p_for_service_case_id=>cid,p_lines=>jsonb_build_array(jsonb_build_object('request_context',changed_context,'revision_key',gen_random_uuid(),'expected_version',1,'reason','TEST same remedy, revised stock/buy choice')));
  perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009699","role":"authenticated","app_metadata":{"role":"principal"}}',true);
  perform public.purchasing_decide_request(rid,'approve',null,jsonb_build_object('expected_version',2,'review_scope',public._purchasing_context_review(rid),'request_context',changed_context,'approved_distribution',null));
  perform public._purchasing_context_execution_admission(rid);
  if jsonb_array_length((select remedy_approval_events from public.service_cases where id=cid))<>2 then raise exception 'second Case approval was created'; end if;
  raise exception 'TEST stock-choice subtransaction rollback';
 exception when raise_exception then if sqlerrm<>'TEST stock-choice subtransaction rollback' then raise; end if;
 end;
 -- Adding a normal follow-up photo does not revoke either approval.
 update public.service_cases set evidence=evidence||jsonb_build_array(jsonb_build_object('slot','all_surfaces','path',cid||'/TEST-followup.jpg','kind','photo','at',now(),'by',auth.uid(),'by_role','principal')) where id=cid;
 perform public._purchasing_context_execution_admission(rid);
 if public._purchasing_assert_request_approval(rid) is distinct from approval_scope then raise exception 'routine evidence forced Purchasing reapproval'; end if;
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009698","role":"authenticated","app_metadata":{"role":"operation"}}',true);
 execute 'set local role authenticated';
 perform public.purchasing_allocate_ready_units(stock_d,array[stock],'{}'::uuid[]);
 execute 'reset role';
 if not exists(select 1 from public.ops_stock_items where id=stock and reserved_purchase_demand_id=stock_d) then raise exception 'approved SC stock not reserved through owning writer'; end if;
 -- Same approved need: one from stock and one still to buy.
 for n in 0..1000 loop
  eta:=(now() at time zone 'Asia/Kuala_Lumpur')::date+n;
  begin
   perform public._purchasing_check_context_supplier_dates(jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('id',buy_d.request_line_id,'sku',buy_d.sku,'allocations',jsonb_build_array(jsonb_build_object('supplierDeliveryDate',eta))))),(now() at time zone 'Asia/Kuala_Lumpur')::date);
   exit;
  exception when invalid_parameter_value then null; end;
 end loop;
 po_payload:=jsonb_build_array(jsonb_build_object('context_issue_key',gen_random_uuid(),'supplier_id',buy_d.supplier_id,'warehouse_id',dest.warehouse_id,'destination_id',dest.id,'purpose','service_case','eta_date',eta,
  'procurement_partner_id',case when (select kind from public.suppliers where id=buy_d.supplier_id)='factory_pickup' then coalesce((select collected_by_partner_id from public.purchasing_supplier_settings where supplier_id=buy_d.supplier_id),(select id from public.delivery_partners order by id limit 1)) else null end,
  'lines',jsonb_build_array(jsonb_build_object('sku',sku,'qty',1,'attrs',buy_d.attrs,'request_sources',jsonb_build_array(jsonb_build_object('demand_id',buy_d.id,'qty',1,'request_version',1,'approval_version',1,'approval_token',md5(approval_scope::text),'recipients',c#>'{lines,0,allocations,0,recipients}'))))));
 execute 'set local role authenticated';
 result:=public.purchasing_issue_pos_batch(po_payload);
 execute 'reset role';
 created_po:=result#>>'{po_ids,0}';
 if created_po is null or not exists(select 1 from public.purchase_order_lines where po_id=created_po and qty=1) then raise exception 'approved SC remaining PO not issued'; end if;
 if (select sum(qty) from public.purchase_demands where request_id=rid)<>2 then raise exception 'requested quantity rewritten'; end if;
 denied:=false;
 begin
  update public.service_cases set carres_action='TEST changed remedy' where id=cid;
  perform public._purchasing_context_execution_admission(rid);
 exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'changed remedy reused old approval'; end if;
 denied:=false;
 begin
  update public.purchase_requests set request_context=jsonb_set(request_context,'{lines,0,qty}','3') where id=rid;
  perform public._purchasing_context_execution_admission(rid);
 exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'third good reused approval for two'; end if;
 denied:=false;
 begin update public.approvals set payload=jsonb_set(payload,'{proposal,remedy}','"repair"') where id=key; exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'approved scope changed in place'; end if;
 if (select remedy_approval_events from public.service_cases where id=cid) is distinct from baseline_events then raise exception 'routine follow-up created another Case approval'; end if;
 if (public.purchasing_request_context_release()->>'serviceExecution')::boolean is not true or (public.purchasing_request_context_release()->>'cancellation')::boolean is not false then raise exception 'release flags disagree'; end if;
 raise notice 'SC remedy PASS: actual qualified Case decision; separate Purchasing approval; stock1+PO1 of requested2; immutable actor/history; retries; wrong-duty/generic-door/forged-history/changed-remedy/third-good refused; routine follow-up preserves both approvals';
end;
$test$;
