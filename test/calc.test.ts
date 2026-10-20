import { describe, expect, it } from 'vitest';
import { UblValidationError, calculateInvoice } from '../src';
import type { UblCalcLine } from '../src';
import * as calcEntry from '../src/calc-entry';

const line = (over: Partial<UblCalcLine> = {}): UblCalcLine => ({
  quantity: 1,
  price: 1000,
  vatRate: 20,
  ...over,
});

describe('calculateInvoice: GİB examples', () => {
  it('reproduces TicariFaturaOrnegi.xml to the kuruş', () => {
    // UBL-TR 1.2.1 paketi, TicariFaturaOrnegi.xml: 8 lines at 18%, two with a percent discount.
    const lines: UblCalcLine[] = [
      { quantity: 12, price: 825.5, discountRate: 5, vatRate: 18 },
      { quantity: 8, price: 1215, discountRate: 3, vatRate: 18 },
      { quantity: 18, price: 38.25, vatRate: 18 },
      { quantity: 13, price: 121.3, vatRate: 18 },
      { quantity: 200, price: 7, vatRate: 18 },
      { quantity: 200, price: 11, vatRate: 18 },
      { quantity: 80, price: 4.25, vatRate: 18 },
      { quantity: 80, price: 2.15, vatRate: 18 },
    ];
    const calc = calculateInvoice({ lines });

    expect(calc.lines.map((l) => l.lineAmount)).toEqual([
      9410.7, 9428.4, 688.5, 1576.9, 1400, 2200, 340, 172,
    ]);
    expect(calc.lines.map((l) => l.taxAmount)).toEqual([
      1693.93, 1697.11, 123.93, 283.84, 252, 396, 61.2, 30.96,
    ]);
    expect(calc.lines[0]!.allowanceCharges).toEqual([
      {
        isCharge: false,
        amount: 495.3,
        baseAmount: 9906,
        multiplierFactor: 0.05,
        fromDocument: false,
      },
    ]);
    expect(calc.lines[1]!.allowanceCharges[0]).toMatchObject({
      amount: 291.6,
      baseAmount: 9720,
      multiplierFactor: 0.03,
    });
    expect(calc).toMatchObject({
      lineExtensionAmount: 26003.4,
      allowanceTotalAmount: 786.9,
      taxExclusiveAmount: 25216.5,
      vatAmount: 4538.97,
      taxTotalAmount: 4538.97,
      taxInclusiveAmount: 29755.47,
      payableAmount: 29755.47,
      withholdingTaxAmount: 0,
    });
    expect(calc.taxSubtotals).toEqual([
      { vatRate: 18, taxTypeCode: '0015', taxableAmount: 25216.5, taxAmount: 4538.97 },
    ]);
  });

  it('reproduces TEVKIFAT.xml: 606 withholds 9/10 of the VAT', () => {
    const calc = calculateInvoice({
      lines: [{ quantity: 1, price: 20000, vatRate: 18, withholdingTaxCode: '606' }],
    });
    expect(calc.lines[0]).toMatchObject({
      lineAmount: 20000,
      taxAmount: 3600,
      withholdingTaxCode: '606',
      withholdingTaxRate: 90,
      withholdingTaxAmount: 3240,
    });
    expect(calc).toMatchObject({
      lineExtensionAmount: 20000,
      taxExclusiveAmount: 20000,
      vatAmount: 3600,
      taxTotalAmount: 360,
      taxInclusiveAmount: 23600,
      withholdingTaxAmount: 3240,
      payableAmount: 20360,
    });
    expect(calc.withholdingSubtotals).toEqual([
      { code: '606', rate: 90, taxableAmount: 3600, taxAmount: 3240 },
    ]);
  });

  it('reproduces TemelFaturaOrnegi.xml and IadeFaturasiOrnegi.xml', () => {
    expect(
      calculateInvoice({ lines: [{ quantity: 101, price: 0.15, vatRate: 18 }] }),
    ).toMatchObject({ taxExclusiveAmount: 15.15, vatAmount: 2.73, payableAmount: 17.88 });
    // A return is calculated like any invoice: 18 × 38.25 at 18%.
    expect(
      calculateInvoice({ lines: [{ quantity: 18, price: 38.25, vatRate: 18 }] }),
    ).toMatchObject({ taxExclusiveAmount: 688.5, vatAmount: 123.93, payableAmount: 812.43 });
  });
});

describe('calculateInvoice: rounding', () => {
  it('rounds half a kuruş away from zero, once per amount', () => {
    const calc = calculateInvoice({
      lines: [
        line({ price: 40.15, vatRate: 10 }),
        line({ price: 102.5, vatRate: 1 }),
        line({ price: 160.45, vatRate: 10 }),
      ],
    });
    // 4.015 → 4.02, 1.025 → 1.03, 16.045 → 16.05 (toFixed gave 4.01, 1.02, 16.04).
    expect(calc.lines.map((l) => l.taxAmount)).toEqual([4.02, 1.03, 16.05]);
    expect(calc.vatAmount).toBe(21.1);
  });

  it("rounds once per rate group with rounding: 'document'", () => {
    const lines = [line({ price: 40.15, vatRate: 10 }), line({ price: 160.45, vatRate: 10 })];
    // Per line 4.02 + 16.05 = 20.07; the group 200.60 × 10% = 20.06.
    expect(calculateInvoice({ lines }).vatAmount).toBe(20.07);
    const calc = calculateInvoice({ lines }, { rounding: 'document' });
    expect(calc.vatAmount).toBe(20.06);
    expect(calc.taxSubtotals[0]!.taxAmount).toBe(20.06);
    // The group VAT is spread: each line within a kuruş of its exact VAT, adding up to 20.06.
    expect(calc.lines.map((l) => l.taxAmount)).toEqual([4.01, 16.05]);
  });

  it('keeps eight decimals on the unit price and rounds the line once', () => {
    const calc = calculateInvoice({ lines: [line({ quantity: 3, price: 27.777778 })] });
    expect(calc.lines[0]).toMatchObject({ price: 27.777778, lineAmount: 83.33, taxAmount: 16.67 });
  });

  it('adds in whole kuruş (no float noise)', () => {
    const calc = calculateInvoice({
      lines: [line({ price: 0.1, vatRate: 0 }), line({ price: 0.2, vatRate: 0 })],
    });
    expect(calc.taxExclusiveAmount).toBe(0.3);
  });
});

describe('calculateInvoice: price, discounts and surcharges', () => {
  it('writes the unit price with eight decimals', () => {
    const calc = calculateInvoice({ lines: [line({ quantity: 3, price: 100 / 3 })] });
    expect(calc.lines[0]).toMatchObject({ price: 33.33333333, lineAmount: 100 });
  });

  it('takes the discount amount over the rate, and writes the rate when it matches', () => {
    const byAmount = calculateInvoice({ lines: [line({ discount: 50, discountRate: 5 })] });
    expect(byAmount.lines[0]!.allowanceCharges[0]).toMatchObject({
      amount: 50,
      multiplierFactor: 0.05,
    });
    const mismatch = calculateInvoice({ lines: [line({ discount: 33.33, discountRate: 5 })] });
    expect(mismatch.lines[0]!.allowanceCharges[0]!.multiplierFactor).toBe(0.03333);
  });

  it('adds a surcharge to the line amount (artırım)', () => {
    const calc = calculateInvoice({
      lines: [line({ price: 900, surchargeRate: 10 }), line({ price: 900, surchargeAmount: 100 })],
    });
    expect(calc.lines.map((l) => l.lineAmount)).toEqual([990, 1000]);
    expect(calc.lines[0]!.allowanceCharges[0]).toMatchObject({
      isCharge: true,
      amount: 90,
      multiplierFactor: 0.1,
    });
    expect(calc).toMatchObject({
      chargeTotalAmount: 190,
      lineExtensionAmount: 1990,
      taxExclusiveAmount: 1990,
      vatAmount: 398,
      payableAmount: 2388,
    });
  });

  it('rejects a discount larger than the line', () => {
    expect(() => calculateInvoice({ lines: [line({ discount: 1000.01 })] })).toThrow(
      /lines\[0\]\.discount/,
    );
  });

  it('spreads a document discount over the lines by net amount', () => {
    const calc = calculateInvoice({
      lines: [line({ price: 1000, vatRate: 20 }), line({ price: 500, vatRate: 10 })],
      headerAllowanceCharges: [{ isCharge: false, percent: 10, reason: 'Genel iskonto' }],
    });
    expect(calc.lines.map((l) => l.lineAmount)).toEqual([900, 450]);
    expect(calc.lines[0]!.allowanceCharges).toEqual([
      {
        isCharge: false,
        reason: 'Genel iskonto',
        amount: 100,
        baseAmount: 1000,
        multiplierFactor: 0.1,
        fromDocument: true,
      },
    ]);
    // VAT on what each line really costs: 900 × 20% + 450 × 10%.
    expect(calc.vatAmount).toBe(225);
    expect(calc.allowanceTotalAmount).toBe(150);
    expect(calc.payableAmount).toBe(1575);
  });

  it('keeps a document discount whole to the kuruş', () => {
    const calc = calculateInvoice({
      lines: [line({ price: 1 }), line({ price: 1 }), line({ price: 1 })],
      headerAllowanceCharges: [{ isCharge: false, amount: 1 }],
    });
    expect(calc.lines.map((l) => l.discount)).toEqual([0.33, 0.33, 0.34]);
    expect(calc.allowanceTotalAmount).toBe(1);
  });
});

describe('calculateInvoice: withholding', () => {
  it('takes the rate from the code and rounds the withheld part once', () => {
    // VAT 246.95 × 9/10 = 222.255 → 222.26 (yapı denetim, 608).
    const calc = calculateInvoice({
      lines: [line({ price: 1234.75, withholdingTaxCode: '608' })],
    });
    expect(calc.lines[0]).toMatchObject({ taxAmount: 246.95, withholdingTaxAmount: 222.26 });
    expect(calc.payableAmount).toBe(1259.44);
  });

  it('withholds all of the VAT on 801-825', () => {
    const calc = calculateInvoice({ lines: [line({ withholdingTaxCode: '801' })] });
    expect(calc.lines[0]).toMatchObject({ withholdingTaxRate: 100, withholdingTaxAmount: 200 });
    expect(calc.payableAmount).toBe(1000);
  });

  it('rejects an unknown code', () => {
    for (const code of ['9015', '650']) {
      expect(() => calculateInvoice({ lines: [line({ withholdingTaxCode: code })] })).toThrow(
        UblValidationError,
      );
    }
  });
});

describe('calculateInvoice: VAT-inclusive lines (vatInclusiveAmount)', () => {
  const inclusive = (amount: number, over: Partial<UblCalcLine> = {}): UblCalcLine =>
    line({ price: 0, vatInclusiveAmount: amount, ...over });

  it('charges the VAT-inclusive amount exactly and takes the VAT out of it', () => {
    // No net n gives n + round(n × 20%) = 1000.05; the VAT is taken out of the amount instead.
    const calc = calculateInvoice({ lines: [inclusive(1000.05)] });
    expect(calc.lines[0]).toMatchObject({ price: 833.37, lineAmount: 833.37, taxAmount: 166.68 });
    expect([calc.taxInclusiveAmount, calc.payableAmount, calc.payableRoundingAmount]).toEqual([
      1000.05, 1000.05, 0,
    ]);
  });

  it('derives the unit price over the quantity and around the discount and surcharge', () => {
    const three = calculateInvoice({ lines: [inclusive(100, { quantity: 3 })] });
    expect(three.lines[0]).toMatchObject({
      price: 27.77666667,
      grossAmount: 83.33,
      lineAmount: 83.33,
    });
    expect(three.payableAmount).toBe(100);

    const discounted = calculateInvoice({
      lines: [inclusive(1200, { discount: 100, surchargeAmount: 50 })],
    });
    expect(discounted.lines[0]).toMatchObject({
      price: 1050,
      grossAmount: 1050,
      discount: 100,
      surchargeAmount: 50,
      lineAmount: 1000,
      taxAmount: 200,
    });
    expect(discounted.payableAmount).toBe(1200);
  });

  it('takes withholding from the VAT inside the amount', () => {
    const calc = calculateInvoice({ lines: [inclusive(1000.05, { withholdingTaxCode: '606' })] });
    // 9/10 of 166.68 = 150.012 → 150.01.
    expect(calc.lines[0]).toMatchObject({ taxAmount: 166.68, withholdingTaxAmount: 150.01 });
    expect(calc.payableAmount).toBe(850.04);
  });

  it('mixes with net-priced lines; each keeps its own rule', () => {
    const calc = calculateInvoice({
      lines: [inclusive(1000.05), line({ price: 40.15, vatRate: 10 })],
    });
    expect(calc.lines.map((l) => l.taxAmount)).toEqual([166.68, 4.02]);
    expect(calc.payableAmount).toBe(1044.22);
  });

  it('refuses rates, document allowances and document rounding next to it', () => {
    expect(() => calculateInvoice({ lines: [inclusive(100, { discountRate: 5 })] })).toThrow(
      /discountRate/,
    );
    expect(() =>
      calculateInvoice({
        lines: [inclusive(100)],
        headerAllowanceCharges: [{ isCharge: false, amount: 10 }],
      }),
    ).toThrow(/headerAllowanceCharges/);
    expect(() => calculateInvoice({ lines: [inclusive(100)] }, { rounding: 'document' })).toThrow(
      /rounding/,
    );
  });

  it('refuses a negative amount and a discount larger than the net', () => {
    expect(() => calculateInvoice({ lines: [inclusive(-1)] })).toThrow(/vatInclusiveAmount/);
    expect(() => calculateInvoice({ lines: [inclusive(120, { surchargeAmount: 150 })] })).toThrow(
      UblValidationError,
    );
  });
});

describe('calculateInvoice: payable rounding', () => {
  it('adds PayableRoundingAmount to the payable amount, never to a line', () => {
    // The exact reversal of an invoice issued for 500.00 with another rounding: 333.33 + 83.34
    // net, VAT by rule 66.67 + 16.67 = 500.01, closed with -0.01.
    const calc = calculateInvoice({
      lines: [line({ price: 333.33 }), line({ price: 83.34 })],
      payableRoundingAmount: -0.01,
    });
    expect(calc.lines.map((l) => l.taxAmount)).toEqual([66.67, 16.67]);
    expect([calc.taxInclusiveAmount, calc.payableRoundingAmount, calc.payableAmount]).toEqual([
      500.01, -0.01, 500,
    ]);
  });

  it('refuses more than one kuruş per line and fractions of a kuruş', () => {
    expect(() =>
      calculateInvoice({ lines: [line({ price: 100 })], payableRoundingAmount: 0.02 }),
    ).toThrow(/payableRoundingAmount/);
    expect(() =>
      calculateInvoice({ lines: [line({ price: 100 })], payableRoundingAmount: 0.005 }),
    ).toThrow(/payableRoundingAmount/);
    expect(
      calculateInvoice({
        lines: [line({ price: 100 }), line({ price: 50 })],
        payableRoundingAmount: 0.02,
      }).payableAmount,
    ).toBe(180.02);
  });
});

describe('@erennyuksell/ubl-tr/calc entry', () => {
  it('exposes the calculator without the XML modules', () => {
    expect(typeof calcEntry.calculateInvoice).toBe('function');
    expect(typeof calcEntry.allocateAmount).toBe('function');
    expect(typeof calcEntry.splitVatInclusive).toBe('function');
    expect(calcEntry.WITHHOLDING_TAX_CODES['606']?.rate).toBe(90);
    expect('buildUblInvoice' in calcEntry).toBe(false);
    expect('InvoiceParser' in calcEntry).toBe(false);
  });
});

describe('calculateInvoice waived VAT (investment incentive exemption)', () => {
  it("shows the VAT and charges none, as GİB's YTB_Istisna_Efatura.xml", () => {
    const result = calculateInvoice({
      lines: [
        { quantity: 15, price: 100, vatRate: 20, taxExemptionReasonCode: '308', vatWaived: true },
      ],
    });
    expect(result.lines[0]).toMatchObject({ lineAmount: 1500, taxAmount: 0, waivedTaxAmount: 300 });
    expect(result.taxSubtotals).toEqual([
      expect.objectContaining({ taxableAmount: 1500, taxAmount: 300, vatRate: 20, waived: true }),
    ]);
    expect(result).toMatchObject({
      vatAmount: 0,
      taxTotalAmount: 0,
      taxExclusiveAmount: 1500,
      taxInclusiveAmount: 1500,
      payableAmount: 1500,
    });
  });
});

describe('calculateInvoice waived VAT input', () => {
  it('refuses a VAT-inclusive price on a waived line', () => {
    expect(() =>
      calculateInvoice({
        lines: [{ quantity: 1, price: 0, vatInclusiveAmount: 1200, vatRate: 20, vatWaived: true }],
      }),
    ).toThrow(UblValidationError);
  });
});
