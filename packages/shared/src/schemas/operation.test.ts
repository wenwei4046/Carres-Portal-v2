import { describe, it, expect } from 'vitest';
import {
  assignPartnerInput,
  attachDoInput,
  receivePoWithDoInput,
  adjustStockInput,
  abandonOrderInput,
  createPoInput,
  createPosBatchInput,
  warehousePickInput,
  issuePosForOrderInput,
  recheckStockInput,
  assignPickupPartnerInput,
  reassignPoWarehouseInput,
  ListOperationOrdersQuery,
  listPurchaseOrdersQuery,
  cancelPoInput,
  listMovementsQuery,
  confirmProceedRequestInputSchema,
  reselectPartnerInput,
  lpAcceptOrderInput,
  lpRejectOrderInput,
  transferReadyInputSchema,
  partnerAcceptRfdInput,
  partnerRejectRfdInput,
  dispatchCustomerLegInput,
  resumeDispatchInput,
} from './operation';

const UUID = '00000000-0000-4000-8000-000000000000';
const UUID2 = '11111111-1111-4111-8111-111111111111';

describe('assignPartnerInput', () => {
  it('accepts a valid uuid', () => {
    expect(assignPartnerInput.safeParse({ partnerId: UUID }).success).toBe(true);
  });
  it('rejects a non-uuid partnerId', () => {
    expect(assignPartnerInput.safeParse({ partnerId: 'not-a-uuid' }).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(assignPartnerInput.safeParse({ partnerId: UUID, extraField: 'x' }).success).toBe(false);
  });
});

describe('attachDoInput', () => {
  const VALID = {
    doNumber: 'DO-9801',
    signed: true as const,
    doFilePath: 'order-00000000-0000-0000-0000-000000000a01/abc-DO-9801.pdf',
    // 0151 — REQUIRED customer e-signature on delivery.
    signaturePath: 'order-00000000-0000-0000-0000-000000000a01/abc-signature.png',
    signerName: 'Mr Tan',
  };
  it('accepts DO# + signed=true + doFilePath (note optional)', () => {
    expect(attachDoInput.safeParse(VALID).success).toBe(true);
  });
  it('rejects when signed is false (customer-signed checkbox required)', () => {
    expect(
      attachDoInput.safeParse({ ...VALID, signed: false }).success,
    ).toBe(false);
  });
  it('rejects when doFilePath is missing (file required post-0087)', () => {
    expect(
      attachDoInput.safeParse({ doNumber: 'DO-9801', signed: true }).success,
    ).toBe(false);
  });
  it('rejects when doFilePath is too short', () => {
    expect(
      attachDoInput.safeParse({ ...VALID, doFilePath: 'ab' }).success,
    ).toBe(false);
  });
  it('rejects when signaturePath is missing (0151 e-sign required)', () => {
    const { signaturePath: _omit, ...noSig } = VALID;
    void _omit;
    expect(attachDoInput.safeParse(noSig).success).toBe(false);
  });
  it('rejects when signerName is missing (0151 e-sign required)', () => {
    const { signerName: _omit, ...noName } = VALID;
    void _omit;
    expect(attachDoInput.safeParse(noName).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      attachDoInput.safeParse({ ...VALID, extraField: 'x' }).success,
    ).toBe(false);
  });
});

describe('receivePoWithDoInput', () => {
  const VALID = {
    doNumber: 'DO-5210',
    doFilePath: 'PO-2050/abc-DO-5210.pdf',
    lines: [{ id: '11111111-1111-4111-8111-111111111111', receivedQty: 2 }],
  };
  it('accepts doNumber + doFilePath + non-empty lines', () => {
    expect(receivePoWithDoInput.safeParse(VALID).success).toBe(true);
  });
  it('accepts receivedQty=0 (RPC handles same-as-current as no-op delta)', () => {
    expect(
      receivePoWithDoInput.safeParse({
        ...VALID,
        lines: [{ id: '11111111-1111-4111-8111-111111111111', receivedQty: 0 }],
      }).success,
    ).toBe(true);
  });
  it('rejects negative receivedQty', () => {
    expect(
      receivePoWithDoInput.safeParse({
        ...VALID,
        lines: [{ id: '11111111-1111-4111-8111-111111111111', receivedQty: -1 }],
      }).success,
    ).toBe(false);
  });
  it('rejects doNumber shorter than 3 chars', () => {
    expect(
      receivePoWithDoInput.safeParse({ ...VALID, doNumber: 'DO' }).success,
    ).toBe(false);
  });
  it('rejects empty doFilePath', () => {
    expect(
      receivePoWithDoInput.safeParse({ ...VALID, doFilePath: '' }).success,
    ).toBe(false);
  });
  it('rejects empty lines array', () => {
    expect(
      receivePoWithDoInput.safeParse({ ...VALID, lines: [] }).success,
    ).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      receivePoWithDoInput.safeParse({ ...VALID, extraField: 'x' }).success,
    ).toBe(false);
  });
});

describe('adjustStockInput', () => {
  it('accepts a negative delta with reason (loss/damage)', () => {
    expect(
      adjustStockInput.safeParse({
        sku: 'MAT-Q-FOAM',
        warehouseId: UUID,
        delta: -1,
        reason: 'damaged in transit',
      }).success,
    ).toBe(true);
  });
  it('rejects when reason is empty', () => {
    expect(
      adjustStockInput.safeParse({
        sku: 'MAT-Q-FOAM',
        warehouseId: UUID,
        delta: 5,
        reason: '',
      }).success,
    ).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      adjustStockInput.safeParse({
        sku: 'MAT-Q-FOAM',
        warehouseId: UUID,
        delta: 1,
        reason: 'fix',
        extraField: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('abandonOrderInput', () => {
  it('accepts a non-empty reason', () => {
    expect(abandonOrderInput.safeParse({ reason: 'customer cancelled' }).success).toBe(true);
  });
  it('rejects empty reason', () => {
    expect(abandonOrderInput.safeParse({ reason: '' }).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      abandonOrderInput.safeParse({ reason: 'customer cancelled', extraField: 'x' }).success,
    ).toBe(false);
  });
});

describe('createPoInput', () => {
  // Phase 4.5 Chunk 2 Sprint E (T25, migration 0055) — every line carries
  // cost (>= 0) + costSource ('hand_entered'|'prev_po'|'system_suggested').
  const VALID_LINE = {
    sku: 'SOFA-OAK-3S',
    qty: 1,
    cost: 1500,
    costSource: 'hand_entered' as const,
  };
  // 0083 (Loo 2026-05-10) — etaDate is now required (ISO date).
  const ETA = '2026-06-01';
  it('accepts supplier + warehouse + at least one line with cost+costSource', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [VALID_LINE],
        etaDate: ETA,
      }).success,
    ).toBe(true);
  });
  it('rejects an empty lines array', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [],
        etaDate: ETA,
      }).success,
    ).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [VALID_LINE],
        etaDate: ETA,
        extraField: 'x',
      }).success,
    ).toBe(false);
  });
  it('rejects a line missing cost (T25 — required for new POs)', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [{ sku: 'SOFA-OAK-3S', qty: 1, costSource: 'hand_entered' }],
        etaDate: ETA,
      }).success,
    ).toBe(false);
  });
  it('rejects a line missing costSource (T25 — required for new POs)', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [{ sku: 'SOFA-OAK-3S', qty: 1, cost: 1500 }],
        etaDate: ETA,
      }).success,
    ).toBe(false);
  });
  it('rejects a negative cost (mirrors DB CHECK cost >= 0)', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [{ ...VALID_LINE, cost: -1 }],
        etaDate: ETA,
      }).success,
    ).toBe(false);
  });
  it('accepts cost = 0 (zero is non-negative)', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [{ ...VALID_LINE, cost: 0 }],
        etaDate: ETA,
      }).success,
    ).toBe(true);
  });
  it('rejects an unknown costSource label', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [{ ...VALID_LINE, costSource: 'made_up' }],
        etaDate: ETA,
      }).success,
    ).toBe(false);
  });
  it('accepts each known costSource label', () => {
    for (const cs of ['hand_entered', 'prev_po', 'system_suggested'] as const) {
      expect(
        createPoInput.safeParse({
          supplierId: UUID,
          warehouseId: UUID2,
          lines: [{ ...VALID_LINE, costSource: cs }],
          etaDate: ETA,
        }).success,
      ).toBe(true);
    }
  });
  // 0083 (Loo 2026-05-10) — etaDate required + must be ISO date.
  it('rejects when etaDate is missing (0083)', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [VALID_LINE],
      }).success,
    ).toBe(false);
  });
  it('rejects empty etaDate (0083)', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [VALID_LINE],
        etaDate: '',
      }).success,
    ).toBe(false);
  });
  it('rejects malformed etaDate (0083)', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [VALID_LINE],
        etaDate: '01/06/2026',
      }).success,
    ).toBe(false);
  });

  // ── 0308 · the manual-purchase reason ─────────────────────────────────────
  //
  // The wire half of `purchase_orders_manual_has_no_customer_order`. The DB
  // CHECK is the enforcement and the RPC names the failure; this schema is the
  // edge, so a caller gets a field-pointed 422 rather than a raw 23514. One
  // rule, three layers, none of them softer than the others.
  const BASE = { supplierId: UUID, warehouseId: UUID2, lines: [VALID_LINE], etaDate: ETA };

  it('0308 — accepts a reason with no customer order (a manual purchase)', () => {
    expect(
      createPoInput.safeParse({ ...BASE, reasonCode: 'Showroom display set' }).success,
    ).toBe(true);
  });
  it('0308 — accepts no reason at all (a customer-driven PO)', () => {
    expect(createPoInput.safeParse({ ...BASE, so: 4001 }).success).toBe(true);
  });
  it('0308 — rejects a reason beside a single customer order', () => {
    expect(
      createPoInput.safeParse({ ...BASE, so: 4001, reasonCode: 'Showroom display set' })
        .success,
    ).toBe(false);
  });
  it('0308 — rejects a reason beside a bundle of customer orders', () => {
    expect(
      createPoInput.safeParse({
        ...BASE,
        soRefs: [4001, 4002],
        reasonCode: 'Showroom display set',
      }).success,
    ).toBe(false);
  });
  it('0308 — an EMPTY soRefs array is not a customer order', () => {
    // The DB CHECK tests `so_refs` by CARDINALITY for the same reason: `{}` is
    // a shape the batch path can produce, and it links to nobody.
    expect(
      createPoInput.safeParse({ ...BASE, soRefs: [], reasonCode: 'Showroom display set' })
        .success,
    ).toBe(true);
  });
  it('0308 — rejects a blank reason (a blank is not a reason)', () => {
    // Mirrors `purchase_orders_reason_not_blank`. Without it the marker could
    // be a space: "manual purchase" to every query, "nothing" to a human.
    expect(createPoInput.safeParse({ ...BASE, reasonCode: '   ' }).success).toBe(false);
    expect(createPoInput.safeParse({ ...BASE, reasonCode: '' }).success).toBe(false);
  });
  it('0308 — the failure points at the reason field, not at the order', () => {
    const r = createPoInput.safeParse({
      ...BASE,
      so: 4001,
      reasonCode: 'Showroom display set',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('reasonCode'))).toBe(true);
    }
  });
});

describe('createPosBatchInput', () => {
  const VALID_PO = {
    supplierId: UUID,
    warehouseId: UUID2,
    lines: [
      {
        sku: 'SOFA-OAK-3S',
        qty: 1,
        cost: 1500,
        costSource: 'hand_entered' as const,
      },
    ],
    // 0083 (Loo 2026-05-10) — etaDate now required on each PO entry.
    etaDate: '2026-06-01',
  };
  it('accepts an array with one valid PO entry', () => {
    expect(
      createPosBatchInput.safeParse({ pos: [VALID_PO] }).success,
    ).toBe(true);
  });
  it('accepts an array with 20 entries (cap)', () => {
    const pos = Array.from({ length: 20 }, () => VALID_PO);
    expect(createPosBatchInput.safeParse({ pos }).success).toBe(true);
  });
  it('rejects an empty pos array', () => {
    expect(createPosBatchInput.safeParse({ pos: [] }).success).toBe(false);
  });
  it('rejects 21 entries (over cap)', () => {
    const pos = Array.from({ length: 21 }, () => VALID_PO);
    expect(createPosBatchInput.safeParse({ pos }).success).toBe(false);
  });
  it('rejects when one entry has empty lines', () => {
    expect(
      createPosBatchInput.safeParse({
        pos: [VALID_PO, { ...VALID_PO, lines: [] }],
      }).success,
    ).toBe(false);
  });
  it('rejects when warehouseId is not uuid in any entry', () => {
    expect(
      createPosBatchInput.safeParse({
        pos: [VALID_PO, { ...VALID_PO, warehouseId: 'nope' }],
      }).success,
    ).toBe(false);
  });
  it('rejects when one entry has a line missing cost (T25 propagation)', () => {
    expect(
      createPosBatchInput.safeParse({
        pos: [
          VALID_PO,
          {
            ...VALID_PO,
            lines: [
              { sku: 'BED-PINE-K', qty: 2, costSource: 'hand_entered' },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('warehousePickInput', () => {
  it('accepts a valid warehouse uuid', () => {
    expect(warehousePickInput.safeParse({ warehouseId: UUID }).success).toBe(true);
  });
  it('rejects a missing warehouseId', () => {
    expect(warehousePickInput.safeParse({}).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      warehousePickInput.safeParse({ warehouseId: UUID, extraField: 'x' }).success,
    ).toBe(false);
  });
});

describe('issuePosForOrderInput', () => {
  it('accepts an empty body', () => {
    expect(issuePosForOrderInput.safeParse({}).success).toBe(true);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(issuePosForOrderInput.safeParse({ orderId: UUID }).success).toBe(false);
  });
});

describe('recheckStockInput', () => {
  it('accepts an empty body', () => {
    expect(recheckStockInput.safeParse({}).success).toBe(true);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(recheckStockInput.safeParse({ foo: 'bar' }).success).toBe(false);
  });
});

describe('assignPickupPartnerInput', () => {
  it('accepts a valid partner uuid', () => {
    expect(assignPickupPartnerInput.safeParse({ partnerId: UUID }).success).toBe(true);
  });
  it('rejects a non-uuid partnerId', () => {
    expect(assignPickupPartnerInput.safeParse({ partnerId: 'P-001' }).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      assignPickupPartnerInput.safeParse({ partnerId: UUID, extraField: 'x' }).success,
    ).toBe(false);
  });
  // v3-S2.4 — optional warehouseId (UI captures the destination override; the
  // current RPC ignores it. v3-S4 will swap to operation_assign_partner_and_dispatch
  // which accepts p_warehouse_override_id).
  it('accepts an optional warehouseId uuid', () => {
    expect(
      assignPickupPartnerInput.safeParse({ partnerId: UUID, warehouseId: UUID2 }).success,
    ).toBe(true);
  });
  it('still accepts payload without warehouseId (backward-compat)', () => {
    expect(assignPickupPartnerInput.safeParse({ partnerId: UUID }).success).toBe(true);
  });
  it('rejects warehouseId that is not a uuid', () => {
    expect(
      assignPickupPartnerInput.safeParse({ partnerId: UUID, warehouseId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  // v3-S3.4 — Outsource toggle (XOR with partnerId).
  // Mirrors DB CHECK constraint `po_outsource_xor_partner` (migration 0030).
  it('accepts the outsource trio (name + contact + zones, no partnerId)', () => {
    expect(
      assignPickupPartnerInput.safeParse({
        outsourcePartnerName: 'Ah Beng Lorry',
        outsourcePartnerContact: '+60 12-345 6789',
        outsourcePartnerZones: 'Klang Valley, Selangor',
      }).success,
    ).toBe(true);
  });
  it('accepts outsource without zones (zones optional)', () => {
    expect(
      assignPickupPartnerInput.safeParse({
        outsourcePartnerName: 'Ah Beng Lorry',
        outsourcePartnerContact: '+60 12-345 6789',
      }).success,
    ).toBe(true);
  });
  it('accepts outsource trio with optional warehouseId', () => {
    expect(
      assignPickupPartnerInput.safeParse({
        outsourcePartnerName: 'Ah Beng Lorry',
        outsourcePartnerContact: '+60 12-345 6789',
        warehouseId: UUID2,
      }).success,
    ).toBe(true);
  });
  it('rejects when both partnerId AND outsourcePartnerName are set (XOR)', () => {
    expect(
      assignPickupPartnerInput.safeParse({
        partnerId: UUID,
        outsourcePartnerName: 'Ah Beng Lorry',
        outsourcePartnerContact: '+60 12-345 6789',
      }).success,
    ).toBe(false);
  });
  it('rejects when neither partnerId nor outsourcePartnerName is set (XOR)', () => {
    expect(
      assignPickupPartnerInput.safeParse({}).success,
    ).toBe(false);
    expect(
      assignPickupPartnerInput.safeParse({ warehouseId: UUID }).success,
    ).toBe(false);
  });
  it('rejects outsourcePartnerName without outsourcePartnerContact', () => {
    expect(
      assignPickupPartnerInput.safeParse({
        outsourcePartnerName: 'Ah Beng Lorry',
      }).success,
    ).toBe(false);
  });
  it('rejects empty-string outsourcePartnerName (min 1)', () => {
    expect(
      assignPickupPartnerInput.safeParse({
        outsourcePartnerName: '',
        outsourcePartnerContact: '+60 12-345 6789',
      }).success,
    ).toBe(false);
  });
  it('rejects empty-string outsourcePartnerContact when name is set', () => {
    expect(
      assignPickupPartnerInput.safeParse({
        outsourcePartnerName: 'Ah Beng Lorry',
        outsourcePartnerContact: '',
      }).success,
    ).toBe(false);
  });
});

describe('reassignPoWarehouseInput', () => {
  it('accepts a valid new warehouse uuid', () => {
    expect(reassignPoWarehouseInput.safeParse({ newWarehouseId: UUID }).success).toBe(true);
  });
  it('rejects a non-uuid newWarehouseId', () => {
    expect(reassignPoWarehouseInput.safeParse({ newWarehouseId: 'WH-1' }).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      reassignPoWarehouseInput.safeParse({ newWarehouseId: UUID, extraField: 'x' }).success,
    ).toBe(false);
  });
});

describe('ListOperationOrdersQuery', () => {
  it('rejects extra keys (strict mode)', () => {
    expect(ListOperationOrdersQuery.safeParse({ stage: 'all', extraField: 'x' }).success).toBe(false);
  });
});

describe('listPurchaseOrdersQuery', () => {
  it('rejects extra keys (strict mode)', () => {
    expect(listPurchaseOrdersQuery.safeParse({ status: 'all', extraField: 'x' }).success).toBe(false);
  });
});

describe('cancelPoInput', () => {
  it('rejects extra keys (strict mode)', () => {
    expect(cancelPoInput.safeParse({ reason: 'duplicate', extraField: 'x' }).success).toBe(false);
  });
});

describe('listMovementsQuery', () => {
  it('accepts an empty object and applies defaults (category=all, kind=all, period=30d)', () => {
    const r = listMovementsQuery.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.category).toBe('all');
      expect(r.data.kind).toBe('all');
      expect(r.data.period).toBe('30d');
    }
  });
  it('accepts period=custom with valid from + to ISO datetimes', () => {
    expect(
      listMovementsQuery.safeParse({
        period: 'custom',
        from: '2026-04-01T00:00:00Z',
        to: '2026-05-01T00:00:00Z',
      }).success,
    ).toBe(true);
  });
  it('rejects search containing shell/sql metacharacters', () => {
    // Whitelist regex blocks ;, %, ', backticks, etc. — phase-4-or-filter-harden.
    expect(listMovementsQuery.safeParse({ search: "%' OR 1=1 --" }).success).toBe(false);
    expect(listMovementsQuery.safeParse({ search: 'PO;DROP' }).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(listMovementsQuery.safeParse({ category: 'all', extraField: 'x' }).success).toBe(false);
  });
});

describe('confirmProceedRequestInputSchema (migration 0147 — item h)', () => {
  it('rejects an empty body (deliveryPartnerId required)', () => {
    expect(confirmProceedRequestInputSchema.safeParse({}).success).toBe(false);
  });
  it('accepts deliveryPartnerId as a uuid', () => {
    expect(confirmProceedRequestInputSchema.safeParse({ deliveryPartnerId: UUID }).success).toBe(true);
  });
  it('rejects deliveryPartnerId that is not a uuid', () => {
    expect(confirmProceedRequestInputSchema.safeParse({ deliveryPartnerId: 'not-a-uuid' }).success).toBe(false);
  });
  it('rejects deliveryPartnerId=null (required, non-nullable)', () => {
    expect(confirmProceedRequestInputSchema.safeParse({ deliveryPartnerId: null }).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(confirmProceedRequestInputSchema.safeParse({ deliveryPartnerId: UUID, extraField: 'x' }).success).toBe(false);
  });
  it('rejects legacy warehouseId field (dropped post-0147)', () => {
    expect(confirmProceedRequestInputSchema.safeParse({ deliveryPartnerId: UUID, warehouseId: UUID }).success).toBe(false);
  });
});

describe('reselectPartnerInput (migration 0147 — item h)', () => {
  it('accepts a uuid partnerId', () => {
    expect(reselectPartnerInput.safeParse({ partnerId: UUID }).success).toBe(true);
  });
  it('rejects empty body', () => {
    expect(reselectPartnerInput.safeParse({}).success).toBe(false);
  });
  it('rejects non-uuid partnerId', () => {
    expect(reselectPartnerInput.safeParse({ partnerId: 'x' }).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(reselectPartnerInput.safeParse({ partnerId: UUID, extra: 1 }).success).toBe(false);
  });
});

describe('lpAcceptOrderInput (migration 0147 — item h)', () => {
  it('accepts empty body', () => {
    expect(lpAcceptOrderInput.safeParse({}).success).toBe(true);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(lpAcceptOrderInput.safeParse({ extra: 1 }).success).toBe(false);
  });
});

describe('lpRejectOrderInput (migration 0147 — item h)', () => {
  it('accepts a non-empty reason', () => {
    expect(lpRejectOrderInput.safeParse({ reason: 'out of capacity' }).success).toBe(true);
  });
  it('rejects empty reason', () => {
    expect(lpRejectOrderInput.safeParse({ reason: '' }).success).toBe(false);
  });
  it('rejects whitespace-only reason (trim+min(1))', () => {
    expect(lpRejectOrderInput.safeParse({ reason: '   ' }).success).toBe(false);
  });
  it('rejects reason >500 chars', () => {
    expect(lpRejectOrderInput.safeParse({ reason: 'a'.repeat(501) }).success).toBe(false);
  });
  it('rejects missing reason', () => {
    expect(lpRejectOrderInput.safeParse({}).success).toBe(false);
  });
  it('rejects extra keys', () => {
    expect(lpRejectOrderInput.safeParse({ reason: 'ok', extra: 1 }).success).toBe(false);
  });
});

describe('transferReadyInputSchema', () => {
  it('rejects an empty body (warehouseId required — RPC `operation_warehouse_pick` raises 22023 warehouse_required on NULL)', () => {
    expect(transferReadyInputSchema.safeParse({}).success).toBe(false);
  });
  it('accepts warehouseId as a uuid', () => {
    expect(transferReadyInputSchema.safeParse({ warehouseId: UUID }).success).toBe(true);
  });
  it('rejects warehouseId=null (RPC rejects NULL — distinct from confirm-proceed which accepts it)', () => {
    expect(transferReadyInputSchema.safeParse({ warehouseId: null }).success).toBe(false);
  });
  it('rejects warehouseId that is not a uuid', () => {
    expect(transferReadyInputSchema.safeParse({ warehouseId: 'bogus' }).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(transferReadyInputSchema.safeParse({ warehouseId: UUID, extraField: 'x' }).success).toBe(false);
  });
});

describe('partnerAcceptRfdInput (Phase 4.5 Chunk 2 Sprint B)', () => {
  it('accepts a valid uuid threadId', () => {
    expect(partnerAcceptRfdInput.safeParse({ threadId: UUID }).success).toBe(true);
  });
  it('rejects a non-uuid threadId (e.g. legacy text PO id)', () => {
    expect(partnerAcceptRfdInput.safeParse({ threadId: 'PO-001' }).success).toBe(false);
  });
  it('rejects an empty body (threadId required)', () => {
    expect(partnerAcceptRfdInput.safeParse({}).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(partnerAcceptRfdInput.safeParse({ threadId: UUID, extraField: 'x' }).success).toBe(false);
  });
});

describe('partnerRejectRfdInput (Phase 4.5 Chunk 2 Sprint B)', () => {
  it('accepts a valid uuid threadId without reason', () => {
    expect(partnerRejectRfdInput.safeParse({ threadId: UUID }).success).toBe(true);
  });
  it('accepts a valid uuid threadId with reason', () => {
    expect(
      partnerRejectRfdInput.safeParse({ threadId: UUID, reason: 'capacity full' }).success,
    ).toBe(true);
  });
  it('rejects a non-uuid threadId', () => {
    expect(partnerRejectRfdInput.safeParse({ threadId: 'PO-001' }).success).toBe(false);
  });
  it('rejects reason longer than 500 chars', () => {
    expect(
      partnerRejectRfdInput.safeParse({ threadId: UUID, reason: 'x'.repeat(501) }).success,
    ).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      partnerRejectRfdInput.safeParse({ threadId: UUID, reason: 'x', extraField: 'x' }).success,
    ).toBe(false);
  });
});

describe('dispatchCustomerLegInput (Phase 4.5 Chunk 2 Sprint B)', () => {
  it('accepts a valid full body with forceDispatch defaulting to false', () => {
    const r = dispatchCustomerLegInput.safeParse({
      threadId: UUID,
      partnerId: UUID2,
      confirmDeliveryDate: '2026-05-20',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.forceDispatch).toBe(false);
    }
  });
  it('accepts forceDispatch=true', () => {
    expect(
      dispatchCustomerLegInput.safeParse({
        threadId: UUID,
        partnerId: UUID2,
        confirmDeliveryDate: '2026-05-20',
        forceDispatch: true,
      }).success,
    ).toBe(true);
  });
  it('rejects a non-uuid threadId', () => {
    expect(
      dispatchCustomerLegInput.safeParse({
        threadId: 'PO-200',
        partnerId: UUID2,
        confirmDeliveryDate: '2026-05-20',
      }).success,
    ).toBe(false);
  });
  it('rejects a non-uuid partnerId', () => {
    expect(
      dispatchCustomerLegInput.safeParse({
        threadId: UUID,
        partnerId: 'P-1',
        confirmDeliveryDate: '2026-05-20',
      }).success,
    ).toBe(false);
  });
  it('rejects an invalid date string', () => {
    expect(
      dispatchCustomerLegInput.safeParse({
        threadId: UUID,
        partnerId: UUID2,
        confirmDeliveryDate: '2026-13-99',
      }).success,
    ).toBe(false);
  });
  it('rejects missing required fields', () => {
    expect(dispatchCustomerLegInput.safeParse({ threadId: UUID }).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      dispatchCustomerLegInput.safeParse({
        threadId: UUID,
        partnerId: UUID2,
        confirmDeliveryDate: '2026-05-20',
        extraField: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('resumeDispatchInput (Phase 4.5 Chunk 2 Sprint B)', () => {
  it('accepts a valid uuid threadId', () => {
    expect(resumeDispatchInput.safeParse({ threadId: UUID }).success).toBe(true);
  });
  it('rejects a non-uuid threadId (e.g. legacy order so int)', () => {
    expect(resumeDispatchInput.safeParse({ threadId: '4001' }).success).toBe(false);
  });
  it('rejects an empty body (threadId required)', () => {
    expect(resumeDispatchInput.safeParse({}).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(resumeDispatchInput.safeParse({ threadId: UUID, extraField: 'x' }).success).toBe(false);
  });
});
