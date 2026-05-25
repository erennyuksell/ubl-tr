import { describe, expect, it } from 'vitest';
import {
  UblValidationError,
  assertValidUblInvoiceInput,
  calculateInvoiceTotals,
  validateUblInvoiceInput,
} from '../src';
import type { UblInvoiceInput, UblInvoiceLine } from '../src';

const lines: UblInvoiceLine[] = [
  {
    name: 'Software service',
    quantity: 2,
    unitCode: 'NIU',
    price: 500,
    lineAmount: 1000,
    vatRate: 20,
    taxAmount: 200,
  },
];

const validInput: UblInvoiceInput = {
  invoiceNo: 'ABC2026000000001',
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  issueDate: new Date('2026-05-25T09:00:00+03:00'),
  profileId: 'TEMELFATURA',
  invoiceTypeCode: 'SATIS',
  currency: 'TRY',
  ...calculateInvoiceTotals(lines),
  supplier: {
    vkn: '1234567890',
    title: 'Supplier A.S.',
    taxOffice: 'Istanbul',
    address: {
      street: 'Example Street',
      district: 'Kadikoy',
      city: 'Istanbul',
      country: 'Turkiye',
    },
  },
  customer: {
    vkn: '11111111111',
    title: 'Customer Name',
    taxOffice: 'Istanbul',
    address: {
      street: 'Customer Street',
      district: 'Besiktas',
      city: 'Istanbul',
      country: 'Turkiye',
    },
  },
  lines,
};

describe('validation', () => {
  it('calculates invoice totals from lines', () => {
    expect(calculateInvoiceTotals(lines)).toEqual({
      taxExclusiveAmount: 1000,
      taxAmount: 200,
      discount: 0,
      payableAmount: 1200,
    });
  });

  it('accepts a valid invoice input', () => {
    expect(validateUblInvoiceInput(validInput)).toEqual({ valid: true, issues: [] });
    expect(() => assertValidUblInvoiceInput(validInput)).not.toThrow();
  });

  it('rejects invalid identifiers and inconsistent totals', () => {
    const invalid = {
      ...validInput,
      taxAmount: 999,
      supplier: {
        ...validInput.supplier,
        vkn: '123',
      },
    };

    const result = validateUblInvoiceInput(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['supplier.vkn', 'taxAmount']),
    );
    expect(() => assertValidUblInvoiceInput(invalid)).toThrow(UblValidationError);
  });
});
