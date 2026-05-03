import { describe, it, expect } from 'vitest';
import { inviteDealerInput, setDealerStatusInput, setDealerTermsInput } from './principal-dealers';

describe('inviteDealerInput', () => {
  it('accepts valid', () => {
    expect(inviteDealerInput.safeParse({ name: 'X Co', region: 'KL', contact: 'Loo · 012' }).success).toBe(true);
  });
  it('rejects empty name', () => {
    expect(inviteDealerInput.safeParse({ name: '', region: 'KL', contact: 'x' }).success).toBe(false);
  });
  it('trims whitespace and rejects too-short trimmed name', () => {
    expect(inviteDealerInput.safeParse({ name: '  X  ', region: 'KL', contact: 'Loo' }).success).toBe(false);
  });
});

describe('setDealerStatusInput', () => {
  it('allows active', () => {
    expect(setDealerStatusInput.safeParse({ status: 'active' }).success).toBe(true);
  });
  it('allows suspended with reason', () => {
    expect(setDealerStatusInput.safeParse({ status: 'suspended', reason: 'inactive' }).success).toBe(true);
  });
  it('rejects pending', () => {
    expect(setDealerStatusInput.safeParse({ status: 'pending' }).success).toBe(false);
  });
  it('rejects rejected (use approval_decide for that)', () => {
    expect(setDealerStatusInput.safeParse({ status: 'rejected' }).success).toBe(false);
  });
});

describe('setDealerTermsInput', () => {
  it('accepts valid', () => {
    expect(setDealerTermsInput.safeParse({ creditLimit: 50000, paymentTerms: 'NET 30' }).success).toBe(true);
  });
  it('rejects negative credit limit', () => {
    expect(setDealerTermsInput.safeParse({ creditLimit: -1, paymentTerms: 'NET 30' }).success).toBe(false);
  });
  it('rejects unknown payment terms', () => {
    expect(setDealerTermsInput.safeParse({ creditLimit: 0, paymentTerms: 'NET 90' }).success).toBe(false);
  });
  it('accepts zero credit limit', () => {
    expect(setDealerTermsInput.safeParse({ creditLimit: 0, paymentTerms: 'COD' }).success).toBe(true);
  });
});
