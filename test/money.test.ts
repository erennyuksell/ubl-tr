import { describe, expect, it } from 'vitest';
import { fromMinor, roundMoney, roundTo, sumInMinor, toMinor } from '../src/money';

describe('money', () => {
  it('rounds half a kuruş away from zero, where toFixed(2) rounds down', () => {
    expect(roundMoney(2.135)).toBe(2.14);
    expect(roundMoney(4.015)).toBe(4.02);
    expect(roundMoney(10.075)).toBe(10.08);
    expect(roundMoney(8192.005)).toBe(8192.01);
    expect(roundMoney(10000.005)).toBe(10000.01);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(99999.995)).toBe(100000);
    expect(roundMoney(-1.005)).toBe(-1.01);
  });

  it('never returns -0', () => {
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
    expect(Object.is(toMinor(-0.004), 0)).toBe(true);
  });

  it('converts to and from minor units', () => {
    expect(toMinor(16.66)).toBe(1666);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(fromMinor(1666)).toBe(16.66);
    expect(sumInMinor([0.1, 0.2, 0.3])).toBe(60);
  });

  it('rounds to other precisions', () => {
    expect(roundTo(27.7777777777, 8)).toBe(27.77777778);
    expect(roundTo(0.05, 6)).toBe(0.05);
    expect(roundTo(401.5, 0)).toBe(402);
  });
});
