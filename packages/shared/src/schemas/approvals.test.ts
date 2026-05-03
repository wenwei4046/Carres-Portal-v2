import { describe, it, expect } from 'vitest';
import { decideApprovalInput, listApprovalsQuery } from './approvals';

describe('decideApprovalInput', () => {
  it('accepts approved with note', () => {
    expect(decideApprovalInput.safeParse({ status: 'approved', note: 'looks good' }).success).toBe(true);
  });
  it('accepts rejected without note', () => {
    expect(decideApprovalInput.safeParse({ status: 'rejected' }).success).toBe(true);
  });
  it('rejects pending status', () => {
    expect(decideApprovalInput.safeParse({ status: 'pending' }).success).toBe(false);
  });
  it('rejects note longer than 500 chars', () => {
    expect(decideApprovalInput.safeParse({ status: 'approved', note: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('listApprovalsQuery', () => {
  it('defaults status to pending', () => {
    const r = listApprovalsQuery.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe('pending');
  });
  it('accepts all valid status values', () => {
    for (const s of ['pending', 'approved', 'rejected', 'all']) {
      expect(listApprovalsQuery.safeParse({ status: s }).success).toBe(true);
    }
  });
  it('accepts kind filter', () => {
    expect(listApprovalsQuery.safeParse({ kind: 'refund' }).success).toBe(true);
  });
});
