import { describe, expect, it } from 'vitest';
import {
  UblValidationError,
  WITHHOLDING_TAX_CODES,
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

  it('accepts an input with no amounts at all: the calculator supplies them', () => {
    const bare: UblInvoiceInput = {
      ...validInput,
      lines: [{ name: 'Hizmet', quantity: 2, price: 500, vatRate: 20 }],
    };
    delete bare.taxExclusiveAmount;
    delete bare.taxAmount;
    delete bare.discount;
    delete bare.payableAmount;
    expect(validateUblInvoiceInput(bare)).toEqual({ valid: true, issues: [] });
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
});

/** Input whose header totals are left to the calculator. */
function withLines(
  invoiceLines: UblInvoiceLine[],
  over: Partial<UblInvoiceInput> = {},
): UblInvoiceInput {
  const input: UblInvoiceInput = { ...validInput, lines: invoiceLines, ...over };
  for (const field of ['taxExclusiveAmount', 'taxAmount', 'discount', 'payableAmount'] as const) {
    if (!(field in over)) delete input[field];
  }
  return input;
}

function paths(input: UblInvoiceInput, options?: Parameters<typeof validateUblInvoiceInput>[1]) {
  return validateUblInvoiceInput(input, options).issues.map((issue) => issue.path);
}

const vatLine = (lineAmount: number, vatRate: number, taxAmount: number): UblInvoiceLine => ({
  name: 'Hizmet',
  quantity: 1,
  price: lineAmount,
  lineAmount,
  vatRate,
  taxAmount,
});

describe('validation of supplied amounts (exact, no tolerance)', () => {
  it('accepts amounts that equal the calculation, half a kuruş rounded away from zero', () => {
    // 40.15 × 10% = 4.015 → 4.02 (toFixed gave 4.01)
    expect(paths(withLines([vatLine(40.15, 10, 4.02)]))).toEqual([]);
    expect(paths(withLines([vatLine(40.15, 10, 4.01)]))).toEqual(['lines[0].taxAmount']);
    // 102.50 × 1% = 1.025 → 1.03
    expect(paths(withLines([vatLine(102.5, 1, 1.03)]))).toEqual([]);
  });

  it('rejects line VAT one kuruş off: no line VAT other than the rule', () => {
    // 333.33 net at 20% is 66.67; a VAT split from a charged total (66.66) does not pass.
    expect(paths(withLines([vatLine(333.33, 20, 66.66)]))).toEqual(['lines[0].taxAmount']);
    expect(paths(withLines([vatLine(333.33, 20, 66.67)]))).toEqual([]);
  });

  it('checks a VAT-inclusive line against the VAT taken out of its amount', () => {
    const line: UblInvoiceLine = {
      name: 'Abonelik',
      quantity: 1,
      price: 0,
      vatInclusiveAmount: 1000.05,
      vatRate: 20,
      lineAmount: 833.37,
      taxAmount: 166.68,
    };
    expect(paths({ ...withLines([line]), payableAmount: 1000.05 })).toEqual([]);
    expect(paths(withLines([{ ...line, taxAmount: 166.67 }]))).toContain('lines[0].taxAmount');
  });

  it('requires the line amount to be exact', () => {
    const line: UblInvoiceLine = { ...vatLine(83.34, 20, 16.67), lineAmount: 83.35 };
    expect(paths(withLines([line]))).toEqual(['lines[0].lineAmount']);
  });

  it('checks the line amount against the price as written (eight decimals)', () => {
    const line: UblInvoiceLine = {
      name: 'Hizmet',
      quantity: 7,
      price: 100 / 7,
      lineAmount: 100,
      vatRate: 20,
      taxAmount: 20,
    };
    expect(paths(withLines([line]))).toEqual([]);
  });

  it('requires document totals to equal the calculation exactly', () => {
    const input = withLines([vatLine(1000, 20, 200)]);
    expect(paths({ ...input, taxAmount: 200.01, payableAmount: 1200.01 })).toEqual([
      'taxAmount',
      'payableAmount',
    ]);
    // Float noise in the totals is not a difference.
    const noisy = withLines([vatLine(0.1, 0, 0), vatLine(0.2, 0, 0)]);
    expect(paths({ ...noisy, taxExclusiveAmount: 0.1 + 0.2, payableAmount: 0.1 + 0.2 })).toEqual(
      [],
    );
  });

  it('includes the surcharge in the line amount', () => {
    const line: UblInvoiceLine = {
      name: 'Hizmet',
      quantity: 1,
      price: 900,
      surchargeRate: 10,
      surchargeAmount: 100,
      lineAmount: 1000,
      vatRate: 20,
      taxAmount: 200,
    };
    expect(paths(withLines([line]))).toEqual([]);
    expect(calculateInvoiceTotals([line]).payableAmount).toBe(1200);
    expect(paths(withLines([{ ...line, lineAmount: 900 }]))).toEqual(['lines[0].lineAmount']);
  });

  it('rejects a negative discount or surcharge', () => {
    expect(paths(withLines([{ ...vatLine(1000, 20, 200), discount: -1 }]))).toContain(
      'lines[0].discount',
    );
    expect(paths(withLines([{ ...vatLine(1000, 20, 200), surchargeAmount: -1 }]))).toContain(
      'lines[0].surchargeAmount',
    );
  });
});

describe('validation withholding (tevkifat)', () => {
  const withholdingLine: UblInvoiceLine = {
    name: 'Hizmet',
    quantity: 1,
    price: 1000,
    lineAmount: 1000,
    vatRate: 20,
    taxAmount: 200,
    withholdingTaxCode: '606',
    withholdingTaxRate: 90,
    withholdingTaxAmount: 180,
  };
  const tevkifat = { invoiceTypeCode: 'TEVKIFAT' };

  it('takes the withholding off the payable amount', () => {
    expect(calculateInvoiceTotals([withholdingLine])).toEqual({
      taxExclusiveAmount: 1000,
      taxAmount: 20,
      discount: 0,
      payableAmount: 1020,
    });
    expect(paths(withLines([withholdingLine], tevkifat))).toEqual([]);
  });

  it('rounds the withheld part half away from zero, exactly', () => {
    // VAT 0.25 × 90% = 0.225 → 0.23; the seller keeps 0.02.
    const line: UblInvoiceLine = {
      ...withholdingLine,
      price: 1.25,
      lineAmount: 1.25,
      taxAmount: 0.25,
      withholdingTaxAmount: 0.23,
    };
    expect(paths(withLines([line], tevkifat))).toEqual([]);
    expect(paths(withLines([{ ...line, withholdingTaxAmount: 0.22 }], tevkifat))).toEqual([
      'lines[0].withholdingTaxAmount',
    ]);
  });

  it('rejects withholding on an invoice type GİB does not allow it on', () => {
    expect(paths(withLines([withholdingLine], { invoiceTypeCode: 'SATIS' }))).toEqual([
      'invoiceTypeCode',
    ]);
    // GİB's schematron lists IADE but not TEVKIFATIADE.
    const returned = { billingReferenceInvoiceNo: 'ABC2026000000009' };
    expect(
      paths(withLines([withholdingLine], { invoiceTypeCode: 'TEVKIFATIADE', ...returned })),
    ).toEqual(['invoiceTypeCode']);
    expect(paths(withLines([withholdingLine], { invoiceTypeCode: 'IADE', ...returned }))).toEqual(
      [],
    );
  });

  it('does not require withholding on a TEVKIFAT invoice (GİB accepts one without)', () => {
    expect(paths(withLines([vatLine(1000, 20, 200)], tevkifat))).toEqual([]);
  });

  it("checks a supplied rate against GİB's rate for the code", () => {
    expect(paths(withLines([{ ...withholdingLine, withholdingTaxRate: 50 }], tevkifat))).toEqual([
      'lines[0].withholdingTaxRate',
    ]);
    const full: UblInvoiceLine = {
      ...withholdingLine,
      withholdingTaxCode: '801',
      withholdingTaxRate: 100,
      withholdingTaxAmount: 200,
    };
    expect(paths(withLines([full], tevkifat))).toEqual([]);
    expect(paths(withLines([{ ...full, withholdingTaxRate: 90 }], tevkifat))).toEqual([
      'lines[0].withholdingTaxRate',
    ]);
  });

  it('rejects an unknown code: 9015 is a tax type, 650 is not on the list', () => {
    for (const code of ['9015', '650']) {
      expect(
        paths(withLines([{ ...withholdingLine, withholdingTaxCode: code }], tevkifat)),
      ).toContain('lines[0].withholdingTaxCode');
    }
  });

  it('requires a code when withholding is given', () => {
    const noCode = { ...withholdingLine, withholdingTaxCode: '' };
    expect(paths(withLines([noCode], tevkifat))).toEqual(['lines[0].withholdingTaxCode']);
  });

  it('exports the code table with GİB rates', () => {
    expect(Object.keys(WITHHOLDING_TAX_CODES)).toHaveLength(52);
    expect(WITHHOLDING_TAX_CODES['606']?.rate).toBe(90);
    expect(WITHHOLDING_TAX_CODES['624']?.rate).toBe(20);
    for (let code = 801; code <= 825; code += 1) {
      expect(WITHHOLDING_TAX_CODES[String(code)]?.rate).toBe(100);
    }
  });
});

describe('validation of return invoices', () => {
  const returnLines = [vatLine(1000, 20, 200)];

  it("requires the returned invoice's 16-character number on every return type", () => {
    for (const invoiceTypeCode of ['IADE', 'TEVKIFATIADE', 'YTBIADE', 'YTBTEVKIFATIADE']) {
      expect(paths(withLines(returnLines, { invoiceTypeCode }))).toEqual([
        'billingReferenceInvoiceNo',
      ]);
      expect(
        paths(withLines(returnLines, { invoiceTypeCode, billingReferenceInvoiceNo: 'IADE-ABC-1' })),
      ).toEqual(['billingReferenceInvoiceNo']);
      expect(
        paths(
          withLines(returnLines, {
            invoiceTypeCode,
            billingReferenceInvoiceNo: 'ABC2026000000009',
          }),
        ),
      ).toEqual([]);
    }
  });
});
