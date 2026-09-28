import { describe, expect, it } from 'vitest';
import { buildUblInvoice, buildUblInvoiceXml, calculateInvoiceTotals } from '../src';
import type { UblElement, UblInvoiceInput, UblInvoiceLine } from '../src';

const baseInput: UblInvoiceInput = {
  invoiceNo: 'ABC2026000000001',
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  issueDate: new Date('2026-05-25T09:00:00+03:00'),
  profileId: 'TEMELFATURA',
  invoiceTypeCode: 'SATIS',
  currency: 'TRY',
  taxExclusiveAmount: 1000,
  taxAmount: 200,
  discount: 0,
  payableAmount: 1200,
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
  lines: [
    {
      name: 'Software service',
      quantity: 1,
      unitCode: 'NIU',
      price: 1000,
      lineAmount: 1000,
      vatRate: 20,
      taxAmount: 200,
    },
  ],
};

describe('buildUblInvoice', () => {
  it('builds the core provider-independent UBL-TR invoice object', () => {
    const invoice = buildUblInvoice({
      invoiceNo: 'ABC2026000000001',
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      issueDate: new Date('2026-05-25T09:00:00+03:00'),
      profileId: 'TEMELFATURA',
      invoiceTypeCode: 'SATIS',
      currency: 'TRY',
      taxExclusiveAmount: 1000,
      taxAmount: 200,
      discount: 0,
      payableAmount: 1200,
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
      lines: [
        {
          name: 'Software service',
          quantity: 1,
          unitCode: 'NIU',
          price: 1000,
          lineAmount: 1000,
          vatRate: 20,
          taxAmount: 200,
        },
      ],
    });

    expect(invoice).toMatchObject({
      UBLVersionID: '2.1',
      CustomizationID: 'TR1.2',
      ProfileID: 'TEMELFATURA',
      ID: 'ABC2026000000001',
      AccountingSupplierParty: {
        Party: {
          PartyIdentification: [{ ID: { $attributes: { schemeID: 'VKN' } } }],
        },
      },
      AccountingCustomerParty: {
        Party: {
          PartyIdentification: [{ ID: { $attributes: { schemeID: 'TCKN' } } }],
        },
      },
      TaxTotal: { TaxAmount: { $value: 200 } },
      LegalMonetaryTotal: { PayableAmount: { $value: 1200 } },
    });
    expect(invoice.InvoiceLine).toHaveLength(1);
  });

  it('rejects a blank invoice number by default', () => {
    expect(() => buildUblInvoice({ ...baseInput, invoiceNo: '' })).toThrow(
      /invoiceNo: Invoice number is required/,
    );
  });

  it('passes a provider-assigned invoice number through to cbc:ID untouched', () => {
    const blank = buildUblInvoice(
      { ...baseInput, invoiceNo: '' },
      { providerAssignedInvoiceNo: true },
    );
    expect(blank.ID).toBe('');

    // A 3-character series prefix tells the provider which series to allocate from.
    const prefixed = buildUblInvoice(
      { ...baseInput, invoiceNo: 'ABC' },
      { providerAssignedInvoiceNo: true },
    );
    expect(prefixed.ID).toBe('ABC');
  });
});

/** Base input with the given lines and totals taken from them. */
function inputWith(
  invoiceLines: UblInvoiceLine[],
  over: Partial<UblInvoiceInput> = {},
): UblInvoiceInput {
  return { ...baseInput, lines: invoiceLines, ...calculateInvoiceTotals(invoiceLines), ...over };
}

function firstLine(input: UblInvoiceInput): UblElement {
  return buildUblInvoice(input).InvoiceLine[0]!;
}

describe('buildUblInvoice amounts', () => {
  it('rounds amounts to kuruş half away from zero', () => {
    const line: UblInvoiceLine = {
      name: 'Hizmet',
      quantity: 1,
      price: 40.15,
      lineAmount: 40.15,
      vatRate: 10,
      taxAmount: 4.015,
    };
    const invoice = buildUblInvoice(inputWith([line]), { validate: false });
    expect(invoice.TaxTotal).toMatchObject({ TaxAmount: { $value: 4.02 } });
    expect(invoice.LegalMonetaryTotal).toMatchObject({
      TaxInclusiveAmount: { $value: 44.17 },
      PayableAmount: { $value: 44.17 },
    });
  });

  it('writes PayableRoundingAmount right before PayableAmount, only when there is one', () => {
    const lines: UblInvoiceLine[] = [
      { name: 'Abonelik', quantity: 1, price: 333.33, vatRate: 20 },
      { name: 'Vade farkı', quantity: 1, price: 83.34, vatRate: 20 },
    ];
    const rounded = buildUblInvoice(
      inputWith(lines, { payableRoundingAmount: -0.01, payableAmount: 500 }),
    );
    expect(Object.keys(rounded.LegalMonetaryTotal as object).slice(-2)).toEqual([
      'PayableRoundingAmount',
      'PayableAmount',
    ]);
    expect(rounded.LegalMonetaryTotal).toMatchObject({
      TaxInclusiveAmount: { $value: 500.01 },
      PayableRoundingAmount: { $value: -0.01 },
      PayableAmount: { $value: 500 },
    });
    const plain = buildUblInvoice(inputWith(lines));
    expect('PayableRoundingAmount' in (plain.LegalMonetaryTotal as object)).toBe(false);
  });

  it('writes a VAT-inclusive line as its net unit price, with the amount charged as total', () => {
    const lines: UblInvoiceLine[] = [
      {
        name: 'Abonelik (KUPON indirimi)',
        quantity: 1,
        price: 0,
        vatInclusiveAmount: 1000.05,
        vatRate: 20,
      },
    ];
    const invoice = buildUblInvoice(inputWith(lines));
    expect(invoice.InvoiceLine).toMatchObject([
      {
        Price: { PriceAmount: { $value: 833.37 } },
        LineExtensionAmount: { $value: 833.37 },
        TaxTotal: { TaxAmount: { $value: 166.68 } },
      },
    ]);
    expect(invoice.LegalMonetaryTotal).toMatchObject({
      TaxExclusiveAmount: { $value: 833.37 },
      TaxInclusiveAmount: { $value: 1000.05 },
      PayableAmount: { $value: 1000.05 },
    });
    expect('PayableRoundingAmount' in (invoice.LegalMonetaryTotal as object)).toBe(false);
  });

  it('keeps up to eight decimals on PriceAmount', () => {
    const line: UblInvoiceLine = {
      name: 'Hizmet',
      quantity: 3,
      price: 27.777778,
      lineAmount: 83.33,
      vatRate: 20,
      taxAmount: 16.67,
    };
    expect(firstLine(inputWith([line]))).toMatchObject({
      LineExtensionAmount: { $value: 83.33 },
      Price: { PriceAmount: { $value: 27.777778 } },
    });
  });

  it('writes the discount rate as a fraction, as GİB does (TicariFaturaOrnegi line 1)', () => {
    const line: UblInvoiceLine = {
      name: 'Masa Üstü Bilgisayar',
      quantity: 12,
      price: 825.5,
      discount: 495.3,
      lineAmount: 9410.7,
      vatRate: 18,
      taxAmount: 1693.93,
    };
    expect(firstLine(inputWith([line]))).toMatchObject({
      AllowanceCharge: [
        {
          ChargeIndicator: false,
          MultiplierFactorNumeric: 0.05,
          Amount: { $value: 495.3 },
          BaseAmount: { $value: 9906 },
        },
      ],
    });
    const xml = buildUblInvoiceXml(inputWith([line]));
    expect(xml).toContain('<MultiplierFactorNumeric>0.05</MultiplierFactorNumeric>');
  });

  it('writes a surcharge as ChargeIndicator=true and keeps it in the line amount', () => {
    const line: UblInvoiceLine = {
      name: 'Hizmet',
      quantity: 1,
      price: 1000,
      surchargeRate: 10,
      surchargeAmount: 100,
      surchargeReason: 'Artırım',
      lineAmount: 1100,
      vatRate: 20,
      taxAmount: 220,
    };
    const invoice = buildUblInvoice(inputWith([line]));
    expect(invoice.InvoiceLine[0]).toMatchObject({
      LineExtensionAmount: { $value: 1100 },
      AllowanceCharge: [
        {
          ChargeIndicator: true,
          AllowanceChargeReason: 'Artırım',
          MultiplierFactorNumeric: 0.1,
          Amount: { $value: 100 },
          BaseAmount: { $value: 1000 },
        },
      ],
    });
    expect(invoice.LegalMonetaryTotal).toMatchObject({
      LineExtensionAmount: { $value: 1100 },
      TaxExclusiveAmount: { $value: 1100 },
      TaxInclusiveAmount: { $value: 1320 },
      PayableAmount: { $value: 1320 },
    });
  });

  it('derives the factor from the amounts when the stated rate does not reproduce them', () => {
    const line: UblInvoiceLine = {
      name: 'Hizmet',
      quantity: 1,
      price: 1000,
      surchargeRate: 12,
      surchargeAmount: 100,
      lineAmount: 1100,
      vatRate: 20,
      taxAmount: 220,
    };
    expect(firstLine(inputWith([line]))).toMatchObject({
      AllowanceCharge: [{ MultiplierFactorNumeric: 0.1 }],
    });
  });

  it('writes a document discount on the lines, where the VAT follows it', () => {
    const rest: UblInvoiceInput = { ...baseInput };
    delete rest.taxExclusiveAmount;
    delete rest.taxAmount;
    delete rest.discount;
    delete rest.payableAmount;
    const invoice = buildUblInvoice({
      ...rest,
      lines: [{ name: 'Software service', quantity: 1, price: 1000, vatRate: 20 }],
      headerAllowanceCharges: [{ isCharge: false, percent: 5, baseAmount: 1000, reason: 'Genel' }],
    });
    expect(invoice.AllowanceCharge).toBeUndefined();
    expect(invoice.InvoiceLine[0]).toMatchObject({
      LineExtensionAmount: { $value: 950 },
      AllowanceCharge: [
        {
          ChargeIndicator: false,
          AllowanceChargeReason: 'Genel',
          MultiplierFactorNumeric: 0.05,
          Amount: { $value: 50 },
          BaseAmount: { $value: 1000 },
        },
      ],
      TaxTotal: { TaxAmount: { $value: 190 } },
    });
    expect(invoice.LegalMonetaryTotal).toMatchObject({
      LineExtensionAmount: { $value: 1000 },
      AllowanceTotalAmount: { $value: 50 },
      TaxExclusiveAmount: { $value: 950 },
      PayableAmount: { $value: 1140 },
    });
  });

  it('writes nothing it did not calculate: a supplied amount that differs is an error', () => {
    expect(() => buildUblInvoice({ ...baseInput, payableAmount: 1200.01 })).toThrow(
      /payableAmount: Expected 1200/,
    );
  });

  it('references the returned invoice on every return type', () => {
    const invoice = buildUblInvoice({
      ...baseInput,
      invoiceTypeCode: 'TEVKIFATIADE',
      billingReferenceInvoiceNo: 'ABC2026000000001',
      billingReferenceIssueDate: '2026-05-01',
    });
    expect(invoice.BillingReference).toEqual([
      {
        InvoiceDocumentReference: {
          ID: 'ABC2026000000001',
          DocumentTypeCode: 'IADE',
          IssueDate: '2026-05-01',
        },
      },
    ]);
  });

  it('keeps Delivery before AllowanceCharge on a line (InvoiceLineType order)', () => {
    const line: UblInvoiceLine = {
      name: 'Hizmet',
      quantity: 1,
      price: 1000,
      discount: 100,
      lineAmount: 900,
      vatRate: 20,
      taxAmount: 180,
      delivery: { deliveryTerms: 'FOB' },
    };
    const keys = Object.keys(firstLine(inputWith([line])));
    expect(keys.indexOf('Delivery')).toBeLessThan(keys.indexOf('AllowanceCharge'));
    expect(keys.indexOf('AllowanceCharge')).toBeLessThan(keys.indexOf('TaxTotal'));
  });

  it('spells the payable amount without float noise', () => {
    const line: UblInvoiceLine = {
      name: 'Hizmet',
      quantity: 1,
      price: 850.24,
      lineAmount: 850.24,
      vatRate: 20,
      taxAmount: 170.05,
    };
    const invoice = buildUblInvoice(inputWith([line]));
    expect(invoice.Note).toEqual(['Yalnız #Bin Yirmi Türk Lirası Yirmi Dokuz Kuruş#']);
  });

  it('spells the kuruş of an amount under one lira', () => {
    const line: UblInvoiceLine = {
      name: 'Hizmet',
      quantity: 1,
      price: 0.5,
      lineAmount: 0.5,
      vatRate: 0,
      taxAmount: 0,
      taxExemptionReasonCode: '351',
    };
    const invoice = buildUblInvoice(inputWith([line]));
    expect(invoice.Note).toEqual(['Yalnız #Sıfır Türk Lirası Elli Kuruş#']);
  });
});

describe('buildUblInvoice withholding (GİB TEVKIFAT.xml)', () => {
  // TEVKIFAT.xml: 20000 net, 18% VAT 3600, code 606 at 90% withholds 3240, payable 20360.
  const line: UblInvoiceLine = {
    name: 'İş gücü hizmeti',
    quantity: 1,
    price: 20000,
    lineAmount: 20000,
    vatRate: 18,
    taxAmount: 3600,
    withholdingTaxCode: '606',
    withholdingTaxRate: 90,
    withholdingTaxAmount: 3240,
  };
  const input = inputWith([line], { invoiceTypeCode: 'TEVKIFAT' });

  it('matches the GİB example totals', () => {
    const invoice = buildUblInvoice(input);
    expect(invoice.TaxTotal).toMatchObject({
      TaxAmount: { $value: 360 },
      TaxSubtotal: [{ TaxableAmount: { $value: 20000 }, TaxAmount: { $value: 3600 }, Percent: 18 }],
    });
    expect(invoice.WithholdingTaxTotal).toEqual([
      {
        TaxAmount: { $value: 3240, $attributes: { currencyID: 'TRY' } },
        TaxSubtotal: [
          {
            TaxableAmount: { $value: 3600, $attributes: { currencyID: 'TRY' } },
            TaxAmount: { $value: 3240, $attributes: { currencyID: 'TRY' } },
            Percent: 90,
            TaxCategory: { TaxScheme: { TaxTypeCode: '606' } },
          },
        ],
      },
    ]);
    expect(invoice.LegalMonetaryTotal).toMatchObject({
      LineExtensionAmount: { $value: 20000 },
      TaxExclusiveAmount: { $value: 20000 },
      TaxInclusiveAmount: { $value: 23600 },
      PayableAmount: { $value: 20360 },
    });
  });

  it('writes the line WithholdingTaxTotal right after the line TaxTotal', () => {
    const built = buildUblInvoice(input).InvoiceLine[0]!;
    expect(built).toMatchObject({
      TaxTotal: { TaxAmount: { $value: 3600 } },
      WithholdingTaxTotal: [
        {
          TaxAmount: { $value: 3240 },
          TaxSubtotal: [{ TaxableAmount: { $value: 3600 }, Percent: 90 }],
        },
      ],
    });
    const keys = Object.keys(built);
    expect(keys.indexOf('WithholdingTaxTotal')).toBe(keys.indexOf('TaxTotal') + 1);
    expect(keys.indexOf('Item')).toBe(keys.indexOf('WithholdingTaxTotal') + 1);
  });

  it('never falls back to 9015, even with validation off', () => {
    const noCode: UblInvoiceLine = { ...line };
    delete noCode.withholdingTaxCode;
    expect(() =>
      buildUblInvoice(inputWith([noCode], { invoiceTypeCode: 'TEVKIFAT' }), { validate: false }),
    ).toThrow(/lines\[0\]\.withholdingTaxCode/);
  });

  it('refuses withholding on a SATIS invoice instead of dropping it', () => {
    expect(() => buildUblInvoice({ ...input, invoiceTypeCode: 'SATIS' })).toThrow(
      /invoiceTypeCode: Withholding lines need a withholding invoice type/,
    );
  });
});
