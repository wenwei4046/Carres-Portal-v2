import { describe, it, expect } from 'vitest';
import {
  assignPartnerInput,
  attachDoInput,
  receivePoLineInput,
  adjustStockInput,
  abandonOrderInput,
  createPoInput,
  createPosBatchInput,
  warehousePickInput,
  issuePosForOrderInput,
  recheckStockInput,
  assignPickupPartnerInput,
  reassignPoWarehouseInput,
  listLogisticsOrdersQuery,
  listPurchaseOrdersQuery,
  cancelPoInput,
  listMovementsQuery,
  confirmProceedRequestInputSchema,
  transferReadyInputSchema,
} from './logistics';

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
  it('accepts DO# + signed=true (note optional)', () => {
    expect(
      attachDoInput.safeParse({ doNumber: 'DO-9801', signed: true }).success,
    ).toBe(true);
  });
  it('rejects when signed is false (customer-signed checkbox required)', () => {
    expect(
      attachDoInput.safeParse({ doNumber: 'DO-9801', signed: false }).success,
    ).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      attachDoInput.safeParse({ doNumber: 'DO-9801', signed: true, extraField: 'x' }).success,
    ).toBe(false);
  });
});

describe('receivePoLineInput', () => {
  it('accepts sku + positive int qty', () => {
    expect(
      receivePoLineInput.safeParse({ sku: 'SOFA-OAK-3S', receivedQty: 2 }).success,
    ).toBe(true);
  });
  it('rejects zero or non-integer qty', () => {
    expect(
      receivePoLineInput.safeParse({ sku: 'SOFA-OAK-3S', receivedQty: 0 }).success,
    ).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      receivePoLineInput.safeParse({ sku: 'SOFA-OAK-3S', receivedQty: 2, extraField: 'x' }).success,
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
  it('accepts supplier + warehouse + at least one line', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [{ sku: 'SOFA-OAK-3S', qty: 1 }],
      }).success,
    ).toBe(true);
  });
  it('rejects an empty lines array', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [],
      }).success,
    ).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(
      createPoInput.safeParse({
        supplierId: UUID,
        warehouseId: UUID2,
        lines: [{ sku: 'SOFA-OAK-3S', qty: 1 }],
        extraField: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('createPosBatchInput', () => {
  const VALID_PO = {
    supplierId: UUID,
    warehouseId: UUID2,
    lines: [{ sku: 'SOFA-OAK-3S', qty: 1 }],
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

describe('listLogisticsOrdersQuery', () => {
  it('rejects extra keys (strict mode)', () => {
    expect(listLogisticsOrdersQuery.safeParse({ stage: 'all', extraField: 'x' }).success).toBe(false);
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

describe('confirmProceedRequestInputSchema', () => {
  it('accepts an empty body (warehouseId optional)', () => {
    expect(confirmProceedRequestInputSchema.safeParse({}).success).toBe(true);
  });
  it('accepts warehouseId as a uuid', () => {
    expect(confirmProceedRequestInputSchema.safeParse({ warehouseId: UUID }).success).toBe(true);
  });
  it('accepts warehouseId=null (explicit null)', () => {
    expect(confirmProceedRequestInputSchema.safeParse({ warehouseId: null }).success).toBe(true);
  });
  it('rejects warehouseId that is not a uuid', () => {
    expect(confirmProceedRequestInputSchema.safeParse({ warehouseId: 'not-a-uuid' }).success).toBe(false);
  });
  it('rejects extra keys (strict mode)', () => {
    expect(confirmProceedRequestInputSchema.safeParse({ warehouseId: UUID, extraField: 'x' }).success).toBe(false);
  });
});

describe('transferReadyInputSchema', () => {
  it('rejects an empty body (warehouseId required — RPC `logistics_warehouse_pick` raises 22023 warehouse_required on NULL)', () => {
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
