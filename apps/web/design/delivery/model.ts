// Sample-only data for design review. No database, credentials or production writes.
import { QueryClient } from '@tanstack/react-query';
export const query = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } });
export const day = '2026-09-30';
export const partners = [{ id: 'sample-nets', name: 'NETS', active: true, kv_default: true }, { id: 'sample-al', name: 'AL', active: true }];
export const orders = [
    { id: 'sample-1', so: 9001, customer_name: 'Sample Customer A', delivery_date: '2026-10-02' },
    { id: 'sample-2', so: 9002, customer_name: 'Sample Customer B', delivery_date: '2026-10-01' },
    { id: 'sample-3', so: 9003, customer_name: 'Sample Customer C', delivery_date: day },
    { id: 'sample-4', so: 9004, customer_name: 'Sample Customer D', delivery_date: '2026-09-29' },
    { id: 'sample-5', so: 9005, customer_name: 'Sample Customer E', delivery_date: day },
].map((o, i) => ({ ...o, status: 'proceed_order', operation_stage: 'ready_to_dispatch', warehouse_id: null,
    customer_address_line1: 'Sample address', customer_phone: 'Not recorded', customer_address: 'Sample address, Klang, Selangor', customer_address_city: 'Klang', customer_address_state: 'Selangor', building_type: 'Landed', delivery_floor: 0, delivery_has_lift: false, delivery_access_notes: 'Ground floor access', placed_at: '2026-09-20T00:00:00Z', delivery_date_tbd: false, source_system: null, source_ref: ['SAMPLE ' + (i + 1)],
    ops_assigned_logistic: i === 0 ? null : 'NETS', delivery_partner_id: i === 0 ? null : 'sample-nets', delivery_partners: i === 0 ? null : { id: 'sample-nets', name: 'NETS' }, request_for_delivery_at: null, partner_accepted_at: null, partner_rejected_at: null, partner_rejected_reason: null,
    do_number: i < 2 ? null : 'DO2609-900' + (i + 1), dispatched_at: i >= 2 ? '2026-09-29T02:00:00Z' : null, delivered_at: null, outlet_id: null, dealer_id: 'sample-dealer', dealers: { name: 'Sample showroom' }, order_supplier_threads: [], order_annotations: [],
    order_lines: [{ id: o.id + '-line-1', sku: 'mattress:M1401F-K', qty: 1, unit_price: 1000, label: 'Serena · King' }, { id: o.id + '-line-2', sku: 'bedframe:BF100-K', qty: 1, unit_price: 1000, label: 'Bed frame · King' }],
    allocated_units: [{ sku: 'mattress:M1401F-K', status: 'reserved', qty: 1 }, { sku: 'bedframe:BF100-K', status: 'reserved', qty: 1 }],
    total: 2000, total_amount: 2000, paid_amount: 2000, paid: 2000, payments: [], ops_order_control: { confirmed_delivery_date: i >= 2 ? o.delivery_date : null, confirmed_delivery_time: i >= 2 ? 'Afternoon' : null },
}));
export const arrangements = orders.map((o, i) => ({ id: 'arr-' + o.id, order_id: o.id, leg: 0, partner_id: i === 0 ? null : 'sample-nets', partner_name: i === 0 ? null : 'NETS', confirmed_date: i >= 2 ? o.delivery_date : null, confirmed_time: i >= 2 ? 'Afternoon' : null, expected_arrival: i >= 2 ? '14:30' : null, driver_name: i >= 2 ? 'Sample driver' : null, vehicle: i >= 2 ? 'SAMPLE 123' : null, logistics_note: null, reply_proof_path: null, updated_at: '2026-09-29T02:00:00Z', updated_by: null }));
export const docs = orders.filter(o => o.do_number).map(o => ({ id: 'doc-' + o.id, do_number: o.do_number!, order_id: o.id, issued_at: '2026-09-29T01:00:00Z', trip_groups: null, delivery_date: o.delivery_date, time_slot: 'Afternoon', logistics_partner: 'NETS', voided_at: null, void_reason: null, leg: 0, orders: o, scope: o.order_lines.map((line, i) => ({ code: unitCodes(o.id)[i], label: line.label, qty: line.qty })) }));
export const attempts: any[] = [];
export const handoverEvents = docs.map(d => ({ id: 'hand-' + d.id, delivery_order_id: d.id, do_number: d.do_number, order_id: d.order_id, kind: 'received_by_logistics', recorded_at: '2026-09-29T02:00:00Z', occurred_at: '2026-09-29T02:00:00Z', qty: 2 }));
export const settings = { partners: partners.map(p => ({ ...p, customer_contact_by: 'partner', record_on_behalf_allowed: true, proof_rules: { deliveredPhoto: true, deliveredSignedDo: true, partialSignedDo: true, failedPhoto: false }, services: { stairCarry: true, dismantling: true, disposal: true, charges: [] }, coverage: null })), drivers: [{ id: 'driver-1', partner_id: 'sample-nets', name: 'Sample driver', phone: null, active: true }], vehicles: [{ id: 'vehicle-1', partner_id: 'sample-nets', plate: 'SAMPLE 123', vehicle_type: 'Lorry', capacity: null, driver_name: 'Sample driver', driver_phone: null, active: true }], templates: [], changes: [], partnerAccounts: [], canEdit: false, contactLeadWorkingDays: 3 };
export function unitCodes(id: string) { return ['U1-900-0' + id.slice(-1) + '1', 'U1-900-0' + id.slice(-1) + '2']; }
export function expansion(id: string) { const o = orders.find(o => o.id === id)!; const codes = unitCodes(id); return { defaultDeliverTo: 'Carres Klang', lines: o.order_lines.map((l, i) => ({ lineId: l.id, sku: l.sku, unitIds: [codes[i]], verifiedUnitIds: [codes[i]], deliverTo: [{ name: 'Carres Klang', qty: 1 }] })), unitCoverage: Object.fromEntries(codes.map(u => [u, null])), unitLines: Object.fromEntries(codes.map((u, i) => [u, o.order_lines[i].id])), unitScopes: Object.fromEntries(codes.map(u => [u, 'unit'])), place: codes.map(u => ({ unitCode: u, siteName: 'Carres Klang', holderName: 'Carres' })) }; }
export function sync() {
    query.setQueryData(['operation', 'orders', {}], structuredClone({ orders }));
    query.setQueryData(['operation', 'delivery-arrangements'], structuredClone({ arrangements, contacts: [], cannotDeliver: [] }));
    query.setQueryData(['operation', 'delivery-orders', 'all'], structuredClone({ deliveryOrders: docs, attempts, handoverEvents, proofReviews: [], attemptEvidence: [] }));
    query.setQueryData(['operation', 'partners'], { partners });
    query.setQueryData(['operation', 'delivery-settings'], { ...settings });
    query.setQueryData(['catalog'], { addons: [], products: [] });
    orders.forEach(o => query.setQueryData(['operation', 'orders', o.id, 'expansion'], expansion(o.id)));
}
sync();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
// Intercept every runtime fetch. Unknown or external requests fail closed.
window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
    const p = url.pathname;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (method !== 'GET') {
        const id = p.split('/').pop();
        const a = arrangements.find(a => a.order_id === id);
        if (a && method === 'PUT') {
            const fields = { partnerId: 'partner_id', confirmedDate: 'confirmed_date', confirmedTime: 'confirmed_time', expectedArrival: 'expected_arrival', driverName: 'driver_name', vehicle: 'vehicle', logisticsNote: 'logistics_note' };
            for (const [k, v] of Object.entries(fields))
                if (k in body)
                    (a as any)[v] = body[k];
            a.partner_name = partners.find(p => p.id === a.partner_id)?.name ?? null;
            sync();
            return json({ arrangement: a, saved: true });
        }
        if (p.endsWith('/assign')) {
            for (const s of body.scopes ?? []) {
                const a = arrangements.find(a => a.order_id === s.orderId);
                if (a) {
                    a.partner_id = body.partnerId;
                    a.partner_name = partners.find(p => p.id === body.partnerId)?.name ?? null;
                }
            }
            sync();
            return json({ assigned: true });
        }
        return json({ message: 'This action is not connected in the design preview.' }, 422);
    }
    if (p === '/api/operation/orders')
        return json({ orders });
    if (p === '/api/operation/partners')
        return json({ partners });
    if (p === '/api/catalog')
        return json({ addons: [], products: [] });
    if (p === '/api/operation/delivery-arrangements')
        return json({ arrangements, contacts: [], cannotDeliver: [] });
    if (p === '/api/operation/delivery-orders')
        return json({ deliveryOrders: docs, attempts, handoverEvents, proofReviews: [], attemptEvidence: [] });
    if (p === '/api/operation/delivery-settings')
        return json(settings);
    if (p.endsWith('/expansion')) {
        const id = p.split('/').at(-2)!;
        return json(expansion(id));
    }
    if (p === '/api/ops/tasks')
        return json({ tasks: [] });
    return json({ message: 'Not available in this sample preview.' }, 404);
};
