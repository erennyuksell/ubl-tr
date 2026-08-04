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

  it('requires an invoice number by default', () => {
    const blank = { ...validInput, invoiceNo: '' };

    const result = validateUblInvoiceInput(blank);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain('invoiceNo');
  });

  it('accepts a blank invoice number when the provider assigns it', () => {
    const blank = { ...validInput, invoiceNo: '' };
    const options = { providerAssignedInvoiceNo: true };

    expect(validateUblInvoiceInput(blank, options)).toEqual({ valid: true, issues: [] });
    expect(() => assertValidUblInvoiceInput(blank, options)).not.toThrow();
  });

  it('still reports other issues when the provider assigns the invoice number', () => {
    const blank = { ...validInput, invoiceNo: '', taxAmount: 999 };

    const result = validateUblInvoiceInput(blank, { providerAssignedInvoiceNo: true });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(['taxAmount']);
  });

  it('keeps accepting tolerance as a positional argument', () => {
    const drifted = { ...validInput, taxAmount: 200.005 };

    expect(validateUblInvoiceInput(drifted, 0.0001).valid).toBe(false);
    expect(validateUblInvoiceInput(drifted, 0.01).valid).toBe(true);
    expect(validateUblInvoiceInput(drifted, { tolerance: 0.0001 }).valid).toBe(false);
  });
});
