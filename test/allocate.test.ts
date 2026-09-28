import { describe, expect, it } from 'vitest';
import { allocateAmount, calculateInvoice, splitVatInclusive } from '../src';

describe('splitVatInclusive', () => {
  it('takes the VAT out of a VAT-inclusive amount; the net is the rest', () => {
    expect(splitVatInclusive(120, 20)).toEqual({ lineAmount: 100, taxAmount: 20 });
    expect(splitVatInclusive(1000, 20)).toEqual({ lineAmount: 833.33, taxAmount: 166.67 });
    // 1000.05 × 20 / 120 = 166.675: the VAT rounds half away from zero, the amount stays.
    expect(splitVatInclusive(1000.05, 20)).toEqual({ lineAmount: 833.37, taxAmount: 166.68 });
    expect(splitVatInclusive(0.09, 20)).toEqual({ lineAmount: 0.07, taxAmount: 0.02 });
    expect(splitVatInclusive(50, 0)).toEqual({ lineAmount: 50, taxAmount: 0 });
  });

  it('always adds up to the amount, and matches the calculator on vatInclusiveAmount', () => {
    for (const rate of [1, 10, 18, 20]) {
      for (let minor = 0; minor < 5000; minor += 1) {
        const amount = minor / 100;
        const split = splitVatInclusive(amount, rate);
        expect(Math.round(split.lineAmount * 100) + Math.round(split.taxAmount * 100)).toBe(minor);
        const [line] = calculateInvoice({
          lines: [{ quantity: 1, price: 0, vatInclusiveAmount: amount, vatRate: rate }],
        }).lines;
        expect([line!.lineAmount, line!.taxAmount]).toEqual([split.lineAmount, split.taxAmount]);
      }
    }
  });

  it('gives back round(net × rate) for any amount a net-priced line comes to', () => {
    // The two rules agree wherever both apply: net n, VAT round(n × rate), amount n + VAT.
    for (const rate of [1, 10, 18, 20]) {
      for (let net = 0; net < 5000; net += 1) {
        const [line] = calculateInvoice({
          lines: [{ quantity: 1, price: net / 100, vatRate: rate }],
        }).lines;
        const split = splitVatInclusive(line!.lineAmount + line!.taxAmount, rate);
        expect(split.taxAmount).toBe(line!.taxAmount);
      }
    }
  });

  it('rejects a negative amount or a rate outside 0 to 100', () => {
    expect(() => splitVatInclusive(-1, 20)).toThrow(RangeError);
    expect(() => splitVatInclusive(100, 101)).toThrow(RangeError);
  });
});

describe('allocateAmount', () => {
  it('splits an amount by weight to the kuruş', () => {
    expect(allocateAmount(100, [1, 1, 1])).toEqual([33.33, 33.33, 33.34]);
    // A partial payment of 600 on a 1000 + 200 invoice: 500 net, 100 VAT.
    expect(allocateAmount(600, [1000, 200])).toEqual([500, 100]);
    expect(allocateAmount(0.01, [0, 0])).toEqual([0, 0.01]);
  });
});
