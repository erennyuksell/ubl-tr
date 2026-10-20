import { describe, expect, it } from 'vitest';
import {
  UblValidationError,
  WITHHOLDING_TAX_CODES,
  assertValidUblInvoiceInput,
  calculateInvoiceTotals,
  validateUblInvoiceInput,
} from '../src';
import type { UblInvoiceInput, UblInvoiceLine } from '../src';
import { returnReferences } from '../src/validation';

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
    person: { firstName: 'Customer', familyName: 'Name' },
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

/** What an export line carries: delivery terms, address, transport mode and GTİP. */
const exportDelivery: UblInvoiceLine['delivery'] = {
  deliveryTerms: 'FOB',
  address: { city: 'Bridgtow', country: 'Great Britain' },
  shipment: { transportModeCode: '1', goodsItems: [{ requiredCustomsId: '847130000000' }] },
};

/** The customs authority, the customer of an export and a tax-free sale (customs guide). */
const customsAuthority = {
  vkn: '1460415308',
  title: 'Gümrük ve Ticaret Bakanlığı',
  taxOffice: 'Ulus',
  address: { city: 'Ankara', country: 'Türkiye' },
};
/** A public invoice's spending unit and account (public invoice guide). */
const kamu = {
  profileId: 'KAMU',
  paymentMeans: {
    code: '42',
    financialAccount: { iban: 'TR330006100519786457841326', currencyCode: 'TRY' },
  },
  buyerCustomer: {
    vkn: '1234567890',
    title: 'Harcama Birimi',
    address: { city: 'Ankara', country: 'Türkiye' },
  },
};

const vatLine = (lineAmount: number, vatRate: number, taxAmount: number): UblInvoiceLine => ({
  name: 'Hizmet',
  quantity: 1,
  price: lineAmount,
  lineAmount,
  vatRate,
  taxAmount,
});

/** An export line: no VAT, exemption 301, its delivery (customs guide). */
const exportLine = (withDelivery = true): UblInvoiceLine => ({
  ...vatLine(1000, 0, 0),
  taxExemptionReasonCode: '301',
  taxExemptionReason: '11/1-a Mal ihracatı',
  ...(withDelivery ? { delivery: exportDelivery } : {}),
});
/** A tax-free sale line: VAT kept, exemption 501 (customs guide). */
const taxFreeLine = (): UblInvoiceLine => ({
  ...vatLine(1000, 20, 200),
  taxExemptionReasonCode: '501',
  taxExemptionReason: 'Yolcu Beraberi Eşya',
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
    const exempt = { taxExemptionReasonCode: '351', taxExemptionReason: 'Diğerleri' };
    const noisy = withLines([
      { ...vatLine(0.1, 0, 0), ...exempt },
      { ...vatLine(0.2, 0, 0), ...exempt },
    ]);
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
    for (const invoiceTypeCode of ['IADE', 'TEVKIFATIADE']) {
      expect(paths(withLines(returnLines, { invoiceTypeCode }))).toEqual(['billingReferences']);
      expect(
        paths(withLines(returnLines, { invoiceTypeCode, billingReferenceInvoiceNo: 'IADE-ABC-1' })),
      ).toEqual(['billingReferences[0].invoiceNo']);
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

  it('takes several returned invoices and checks each one', () => {
    const invoiceTypeCode = 'IADE';
    const billingReferences = [
      { invoiceNo: 'ABC2026000000009', issueDate: '2026-05-01' },
      { invoiceNo: 'ABC2026000000010' },
    ];
    expect(paths(withLines(returnLines, { invoiceTypeCode, billingReferences }))).toEqual([]);
    expect(
      paths(
        withLines(returnLines, {
          invoiceTypeCode,
          billingReferences: [...billingReferences, { invoiceNo: 'X' }],
        }),
      ),
    ).toEqual(['billingReferences[2].invoiceNo']);
  });
});

describe('validation of identifiers and text', () => {
  const lines = [vatLine(1000, 20, 200)];

  it('refuses a VKN or TCKN whose check digits do not match', () => {
    const input = withLines(lines);
    expect(paths({ ...input, customer: { ...input.customer, vkn: '1111111111' } })).toEqual([
      'customer.vkn',
    ]);
    expect(paths({ ...input, customer: { ...input.customer, vkn: '12345678901' } })).toEqual([
      'customer.vkn',
    ]);
  });

  it("accepts GİB's placeholder numbers for a final consumer and a foreign buyer", () => {
    const input = withLines(lines);
    expect(paths({ ...input, customer: { ...input.customer, vkn: '11111111111' } })).toEqual([]);
    expect(paths({ ...input, customer: { ...input.customer, vkn: '2222222222' } })).toEqual([]);
  });

  it('does not hold a foreign buyer to the Turkish party rules', () => {
    const input = withLines([exportLine()], {
      profileId: 'IHRACAT',
      invoiceTypeCode: 'ISTISNA',
      customer: customsAuthority,
    });
    const buyerCustomer = {
      vkn: '',
      title: 'Foreign Buyer Ltd.',
      address: { city: 'Berlin', country: 'Almanya' },
      legalEntity: { registrationName: 'Foreign Buyer Ltd.' },
    };
    expect(paths({ ...input, buyerCustomer })).toEqual([]);
  });

  it('writes each returned invoice once', () => {
    const input = withLines(lines, {
      invoiceTypeCode: 'IADE',
      billingReferenceInvoiceNo: 'ABC2026000000009',
      billingReferences: [
        { invoiceNo: 'ABC2026000000009' },
        { invoiceNo: ' ABC2026000000010 ' },
        { invoiceNo: 'ABC2026000000010' },
      ],
    });
    expect(returnReferences(input).map((reference) => reference.invoiceNo)).toEqual([
      'ABC2026000000009',
      'ABC2026000000010',
    ]);
  });

  it('refuses a control character XML cannot carry, with its path', () => {
    const input = withLines(lines);
    expect(paths({ ...input, notes: ['Ödeme\u0007 notu'] })).toEqual(['notes[0]']);
    expect(paths({ ...input, notes: ['Satır\nsonu\tsekme'] })).toEqual([]);
  });
});

describe('validation of the profile and the invoice type', () => {
  const lines = [vatLine(1000, 20, 200)];
  const reference = { billingReferences: [{ invoiceNo: 'ABC2026000000009' }] };

  it('refuses a return under TICARIFATURA and accepts it under TEMELFATURA and EARSIVFATURA', () => {
    const input = (profileId: string) =>
      withLines(lines, { profileId, invoiceTypeCode: 'IADE', ...reference });
    expect(paths(input('TICARIFATURA'))).toEqual(['profileId']);
    expect(paths(input('TEMELFATURA'))).toEqual([]);
    expect(paths(input('EARSIVFATURA'))).toEqual([]);
  });

  it('asks each special profile for the identifications GİB requires', () => {
    expect(paths(withLines(lines, { profileId: 'HKS' }))).toEqual(['lines[0].additionalItemIds']);
    expect(paths(withLines(lines, { profileId: 'ILAC_TIBBICIHAZ' }))).toEqual([
      'lines[0].additionalItemIds',
    ]);
    expect(paths(withLines(lines, { profileId: 'IDIS' }))).toEqual([
      'lines[0].additionalItemIds',
      'supplier.additionalIds',
    ]);
    expect(paths(withLines(lines, { profileId: 'EARSIVFATURA', invoiceTypeCode: 'SARJ' }))).toEqual(
      [
        'lines[0].unitCode',
        'customer.additionalIds',
        'invoicePeriodStart',
        'invoicePeriodStartTime',
        'additionalDocumentReferences',
      ],
    );
    expect(
      paths(withLines(lines, { profileId: 'EARSIVFATURA', invoiceTypeCode: 'TEKNOLOJIDESTEK' })),
    ).toEqual(['lines[0].additionalItemIds']);
    expect(paths(withLines(lines, { profileId: 'YATIRIMTESVIK' }))).toEqual([
      'investmentIncentive',
      'lines[0].classificationCode',
    ]);
  });

  it('takes an investment incentive exemption with expense type 01 or 02 and its own exemption', () => {
    const exemption = (expense: string, code: string) =>
      paths(
        withLines(
          [
            {
              ...vatLine(1500, 20, 0),
              classificationCode: expense,
              modelName: 'Makine',
              itemInstance: { productTraceId: '1', serialId: 'M1' },
              taxExemptionReasonCode: code,
              taxExemptionReason: 'Gerekçe',
            },
          ],
          {
            profileId: 'YATIRIMTESVIK',
            invoiceTypeCode: 'ISTISNA',
            investmentIncentive: { no: '123456', issueDate: '2026-01-01' },
          },
        ),
      );
    expect(exemption('01', '308')).toEqual([]);
    expect(exemption('02', '339')).toEqual([]);
    expect(exemption('01', '339')).toEqual(['lines[0].taxExemptionReasonCode']);
    expect(exemption('03', '308')).toEqual(['lines[0].classificationCode']);
  });

  it("refuses a profile or a type that is not in GİB's lists", () => {
    expect(paths(withLines(lines, { profileId: 'TICARI' }))).toEqual(['profileId']);
    expect(paths(withLines(lines, { invoiceTypeCode: 'SATISS' }))).toEqual(['invoiceTypeCode']);
    expect(
      paths(withLines(lines, { profileId: 'TICARIFATURA', invoiceTypeCode: 'ISTISNA' })),
    ).toEqual([]);
  });
});

describe('validation of the buyer of an export or a tax-free sale', () => {
  const lines = [vatLine(1000, 20, 200)];
  const address = { city: 'London', country: 'Great Britain' };
  const exportInput = (buyerCustomer?: UblInvoiceInput['buyerCustomer']) =>
    withLines([exportLine()], {
      profileId: 'IHRACAT',
      invoiceTypeCode: 'ISTISNA',
      customer: customsAuthority,
      ...(buyerCustomer ? { buyerCustomer } : {}),
    });
  const tourist = {
    vkn: '',
    title: '',
    address,
    person: {
      firstName: 'John',
      familyName: 'Doe',
      nationalityId: 'GB',
      passport: { id: 'P1234567', issueDate: '2024-01-14' },
    },
  };
  const taxRepresentative = {
    vkn: '1234567890',
    alias: 'urn:mail:yolcuberaberpk@ornek.com.tr',
    address: { city: 'İstanbul', country: 'Türkiye' },
  };
  const taxFreeInput = (extra: Partial<UblInvoiceInput>) =>
    withLines([taxFreeLine()], {
      profileId: 'YOLCUBERABERFATURA',
      invoiceTypeCode: 'ISTISNA',
      customer: customsAuthority,
      ...extra,
    });

  it('needs the foreign buyer and its official name on an export', () => {
    expect(paths(exportInput())).toEqual(['buyerCustomer']);
    expect(paths(exportInput({ vkn: '', title: 'Buyer', address }))).toEqual([
      'buyerCustomer.legalEntity.registrationName',
    ]);
  });

  it('needs the tourist, the nationality, the passport and the intermediary on a tax-free sale', () => {
    expect(paths(taxFreeInput({ buyerCustomer: tourist, taxRepresentative }))).toEqual([]);
    expect(paths(taxFreeInput({ buyerCustomer: tourist }))).toEqual(['taxRepresentative']);
    expect(
      paths(
        taxFreeInput({
          buyerCustomer: {
            ...tourist,
            person: { firstName: 'John', familyName: 'Doe', nationalityId: 'XX' },
          },
          taxRepresentative: { ...taxRepresentative, vkn: '1111111111', alias: ' ' },
        }),
      ),
    ).toEqual([
      'buyerCustomer.person.nationalityId',
      'buyerCustomer.person.passport',
      'taxRepresentative.vkn',
      'taxRepresentative.alias',
    ]);
  });

  it('still needs an identification on a buyer of any other profile', () => {
    const input = withLines(lines);
    expect(paths({ ...input, buyerCustomer: { vkn: '', title: 'X', address } })).toEqual([
      'buyerCustomer.vkn',
    ]);
    expect(paths({ ...input, buyerCustomer: { vkn: '1234567890', title: 'X', address } })).toEqual(
      [],
    );
  });
});

describe("validation of GİB's schematron input rules", () => {
  const lines = [vatLine(1000, 20, 200)];
  const exempt = (code: string, extra: Partial<UblInvoiceLine> = {}): UblInvoiceLine => ({
    ...vatLine(1000, 0, 0),
    taxExemptionReasonCode: code,
    taxExemptionReason: 'Gerekçe',
    ...extra,
  });

  it('checks the invoice number, the UUID and the currencies', () => {
    expect(paths(withLines(lines, { invoiceNo: 'AB2026000000001' }))).toEqual(['invoiceNo']);
    expect(
      paths(withLines(lines, { invoiceNo: 'ABC' }), { providerAssignedInvoiceNo: true }),
    ).toEqual([]);
    expect(paths(withLines(lines, { uuid: 'not-a-uuid' }))).toEqual(['uuid']);
    expect(paths(withLines(lines, { currency: 'TL', exchangeRate: 1 }))).toEqual(['currency']);
    expect(paths(withLines(lines, { currency: 'USD' }))).toEqual(['exchangeRate']);
    expect(paths(withLines(lines, { currency: 'USD', exchangeRate: 32.1234567 }))).toEqual([
      'exchangeRate',
    ]);
    expect(paths(withLines(lines, { currency: 'USD', exchangeRate: 32.5 }))).toEqual([]);
  });

  it('checks party identification schemes and the person of a TCKN party', () => {
    const input = withLines(lines);
    expect(
      paths({
        ...input,
        customer: { ...input.customer, additionalIds: [{ schemeID: 'MERSIS', value: '1' }] },
      }),
    ).toEqual(['customer.additionalIds[0].schemeID']);
    expect(
      paths({
        ...input,
        customer: { ...input.customer, additionalIds: [{ schemeID: 'MERSISNO', value: '1' }] },
      }),
    ).toEqual([]);
    expect(
      paths({
        ...input,
        customer: { ...input.customer, person: { firstName: '', familyName: 'Name' } },
      }),
    ).toEqual(['customer.person']);
  });

  it('keeps an invoice to the customs authority to export, tax-free, special and public profiles', () => {
    const input = withLines(lines);
    expect(
      paths({
        ...input,
        customer: {
          vkn: '1460415308',
          title: 'Gümrük',
          taxOffice: 'Ulus',
          address: { city: 'Ankara', country: 'Türkiye' },
        },
      }),
    ).toEqual(['profileId']);
  });

  it('checks tax types and exemptions against the invoice type', () => {
    expect(paths(withLines([{ ...vatLine(1000, 20, 200), taxTypeCode: '9999' }]))).toEqual([
      'lines[0].taxTypeCode',
    ]);
    expect(
      paths(withLines([exempt('301', { taxExemptionReason: '' })], { invoiceTypeCode: 'ISTISNA' })),
    ).toEqual(['lines[0].taxExemptionReason']);
    expect(paths(withLines([exempt('999')], { invoiceTypeCode: 'ISTISNA' }))).toEqual([
      'lines[0].taxExemptionReasonCode',
    ]);
    expect(paths(withLines([exempt('301')]))).toEqual(['lines[0].taxExemptionReasonCode']);
    expect(paths(withLines([exempt('301')], { invoiceTypeCode: 'ISTISNA' }))).toEqual([]);
    expect(paths(withLines([exempt('801')]))).toEqual(['lines[0].taxExemptionReasonCode']);
    expect(paths(withLines([exempt('701')]))).toEqual(['lines[0].taxExemptionReasonCode']);
    expect(paths(withLines([exempt('702')], { invoiceTypeCode: 'IHRACKAYITLI' }))).toEqual([
      'lines[0].delivery.shipment.goodsItems[0].requiredCustomsId',
      'lines[0].delivery.shipment.transportHandlingUnits',
    ]);
  });

  it('asks a reason for a zero VAT outside the types that carry none', () => {
    expect(paths(withLines([vatLine(1000, 0, 0)]))).toEqual(['lines[0].taxExemptionReason']);
    expect(
      paths(
        withLines([vatLine(1000, 0, 0)], {
          invoiceTypeCode: 'IADE',
          billingReferences: [{ invoiceNo: 'ABC2026000000009' }],
        }),
      ),
    ).toEqual([]);
  });

  it('allows 555 (demirbaş KDV) only on a taxed sale under the general profiles', () => {
    expect(
      paths(
        withLines([
          {
            ...vatLine(1000, 20, 200),
            taxExemptionReasonCode: '555',
            taxExemptionReason: 'Demirbaş',
          },
        ]),
      ),
    ).toEqual([]);
    expect(paths(withLines([exempt('555')]))).toEqual(['lines[0].vatRate']);
    expect(
      paths(
        withLines(
          [
            {
              ...vatLine(1000, 20, 200),
              taxExemptionReasonCode: '555',
              taxExemptionReason: 'Demirbaş',
            },
          ],
          kamu,
        ),
      ),
    ).toEqual(['lines[0].taxExemptionReasonCode']);
  });

  it('checks payment means codes and the IBAN of a public invoice', () => {
    expect(paths(withLines(lines, { paymentMeans: { code: '99' } }))).toEqual([
      'paymentMeans.code',
    ]);
    expect(paths(withLines(lines, kamu))).toEqual([]);
    expect(paths(withLines(lines, { profileId: 'KAMU' }))).toEqual([
      'paymentMeans.financialAccount.iban',
      'paymentMeans.financialAccount.currencyCode',
      'buyerCustomer.vkn',
    ]);
    expect(
      paths(
        withLines(lines, {
          ...kamu,
          paymentMeans: {
            code: '42',
            financialAccount: { iban: 'TR33 0006 1005 1978 6457 8413 26', currencyCode: 'TRY' },
          },
        }),
      ),
    ).toEqual(['paymentMeans.financialAccount.iban']);
  });

  it('checks delivery codes and what an export line needs', () => {
    expect(
      paths(
        withLines(lines, {
          delivery: { deliveryTerms: 'XYZ', shipment: { transportModeCode: '12' } },
        }),
      ),
    ).toEqual(['delivery.deliveryTerms', 'delivery.shipment.transportModeCode']);
    const input = withLines([exportLine(false)], {
      profileId: 'IHRACAT',
      invoiceTypeCode: 'ISTISNA',
      customer: customsAuthority,
    });
    const buyerCustomer = {
      vkn: '',
      title: 'B',
      address: { city: 'X', country: 'Y' },
      legalEntity: { registrationName: 'B' },
    };
    expect(paths({ ...input, buyerCustomer })).toEqual([
      'lines[0].delivery.deliveryTerms',
      'lines[0].delivery.address',
      'lines[0].delivery.shipment.transportModeCode',
      'lines[0].delivery.shipment.goodsItems[0].requiredCustomsId',
    ]);
    const onInvoice = {
      deliveryTerms: 'FOB',
      address: { city: 'X', country: 'Y' },
      shipment: { transportModeCode: '1' },
    };
    const gtip = { shipment: { goodsItems: [{ requiredCustomsId: '847130000000' }] } };
    expect(
      paths({
        ...input,
        buyerCustomer,
        delivery: onInvoice,
        lines: input.lines.map((line) => ({ ...line, delivery: gtip })),
      }),
    ).toEqual([]);
  });
});

describe("validation of the rules in GİB's guides", () => {
  it('asks an export for type ISTISNA, the customs authority and exemption 301', () => {
    expect(paths(withLines([vatLine(1000, 20, 200)], { profileId: 'IHRACAT' }))).toEqual(
      expect.arrayContaining([
        'invoiceTypeCode',
        'customer.vkn',
        'lines[0].taxExemptionReasonCode',
      ]),
    );
  });

  it('checks medicine and medical device codes', () => {
    const medicine = (schemeID: string, value: string) =>
      paths(
        withLines([{ ...vatLine(1000, 20, 200), additionalItemIds: [{ schemeID, value }] }], {
          profileId: 'ILAC_TIBBICIHAZ',
        }),
      );
    expect(medicine('ILAC', '(GTIN)8680222690047(BN)0714450(SN)9546433(XD)210909')).toEqual([]);
    expect(medicine('TIBBICIHAZ', '(UNO)86930123456789(LNO)X9812354(URT)180225')).toEqual([]);
    expect(medicine('DIGER', '1111111111')).toEqual([]);
    expect(medicine('ILAC', '8680222690047')).toEqual(['lines[0].additionalItemIds[0].value']);
    expect(medicine('DIGER', 'x')).toEqual(['lines[0].additionalItemIds[0].value']);
  });

  it('asks an SGK invoice for its group, provider, file number and period', () => {
    const sgkInput = (sgk?: UblInvoiceInput['sgk'], extra: Partial<UblInvoiceInput> = {}) =>
      withLines([vatLine(1000, 20, 200)], {
        invoiceTypeCode: 'SGK',
        ...(sgk ? { sgk } : {}),
        ...extra,
      });
    expect(paths(sgkInput())).toEqual(['sgk.group']);
    expect(paths(sgkInput({ group: 'SAGLIK_ECZ' }))).toEqual([
      'sgk.providerCode',
      'sgk.fileNo',
      'invoicePeriodStart',
    ]);
    expect(
      paths(
        sgkInput(
          {
            group: 'SAGLIK_ECZ',
            providerCode: '15425689',
            providerName: 'Deneme Eczanesi',
            fileNo: '798564',
          },
          {
            invoicePeriodStart: new Date('2026-05-01T00:00:00Z'),
            invoicePeriodEnd: new Date('2026-05-31T00:00:00Z'),
          },
        ),
      ),
    ).toEqual([]);
    expect(paths(sgkInput({ group: 'DIGER' }))).toEqual([]);
    const input = withLines([vatLine(1000, 20, 200)]);
    const sgkCustomer = {
      vkn: '7750409379',
      title: 'SGK',
      taxOffice: 'Çankaya',
      address: { city: 'Ankara', country: 'Türkiye' },
    };
    expect(paths({ ...input, customer: sgkCustomer })).toEqual(['invoiceTypeCode']);
  });
});
