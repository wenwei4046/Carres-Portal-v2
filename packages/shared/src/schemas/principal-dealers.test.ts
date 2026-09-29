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

describe('updateDealerInput bank account (0598)', () => {
  it('takes bank, account number and holder, and an empty value clears each', () => {
    const p = updateDealerInput.parse({ bankName: ' Maybank ', bankAccountNo: ' 514012345678 ', bankAccountHolder: ' JB Sleep Sdn Bhd ' });
    expect(p).toEqual({ bankName: 'Maybank', bankAccountNo: '514012345678', bankAccountHolder: 'JB Sleep Sdn Bhd' });
    expect(updateDealerInput.parse({ bankName: '', bankAccountNo: '', bankAccountHolder: '' }))
      .toEqual({ bankName: '', bankAccountNo: '', bankAccountHolder: '' });
  });
  it('accepts an account number of 6 to 20 digits', () => {
    expect(updateDealerInput.safeParse({ bankAccountNo: '123456' }).success).toBe(true);
    expect(updateDealerInput.safeParse({ bankAccountNo: '1'.repeat(20) }).success).toBe(true);
  });
  it('refuses an account number that is short, long, or not all digits', () => {
    for (const bad of ['12345', '1'.repeat(21), '5140 1234 5678', '5140-1234-5678', 'ABC123456']) {
      const r = updateDealerInput.safeParse({ bankAccountNo: bad });
      expect(r.success, bad).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toBe('Account number must be 6 to 20 digits.');
    }
  });
});
