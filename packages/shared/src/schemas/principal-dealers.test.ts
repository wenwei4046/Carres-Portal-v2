import { describe, it, expect } from 'vitest';
import { inviteDealerInput, setDealerStatusInput, updateDealerInput } from './principal-dealers';

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


describe('updateDealerInput code', () => {
  it('uppercases a JB1-style code and lets an empty one clear it', () => {
    expect(updateDealerInput.parse({ code: ' jb1 ' }).code).toBe('JB1');
    expect(updateDealerInput.parse({ code: '' }).code).toBe('');
  });
  it('rejects spaces, dashes and codes over 12 characters', () => {
    expect(updateDealerInput.safeParse({ code: 'JB 1' }).success).toBe(false);
    expect(updateDealerInput.safeParse({ code: 'JB-1' }).success).toBe(false);
    expect(updateDealerInput.safeParse({ code: 'A'.repeat(13) }).success).toBe(false);
  });
});
