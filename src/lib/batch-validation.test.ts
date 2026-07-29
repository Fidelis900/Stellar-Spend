import { describe, it, expect } from 'vitest';

interface BatchBeneficiary {
  accountNumber: string;
  amount: number;
}

function validateBatch(beneficiaries: BatchBeneficiary[]) {
  const errors = [];
  if (beneficiaries.length === 0) errors.push('Batch is empty');

  beneficiaries.forEach((b, i) => {
    if (!b.accountNumber) errors.push(`Row ${i + 1}: Missing account number`);
    if (b.amount <= 0) errors.push(`Row ${i + 1}: Invalid amount`);
  });

  return {
    isValid: errors.length === 0,
    errors,
    totalAmount: beneficiaries.reduce((sum, b) => sum + b.amount, 0),
  };
}

describe('Batch Validation', () => {
  it('should validate empty batch', () => {
    const result = validateBatch([]);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Batch is empty');
  });

  it('should validate correct batch', () => {
    const batch = [
      { accountNumber: '123', amount: 100 },
      { accountNumber: '456', amount: 200 },
    ];
    const result = validateBatch(batch);
    expect(result.isValid).toBe(true);
    expect(result.totalAmount).toBe(300);
  });

  it('should catch invalid rows', () => {
    const batch = [
      { accountNumber: '', amount: 100 },
      { accountNumber: '456', amount: -50 },
    ];
    const result = validateBatch(batch);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBe(2);
  });
});
