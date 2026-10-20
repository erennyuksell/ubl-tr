import { describe, expect, it } from 'vitest';
import {
  WITHHOLDING_CODE_PERCENTS,
  WITHHOLDING_TAX_CODES,
  WITHHOLDING_TAX_TYPE_CODES,
} from '../src';

describe("GİB's code lists", () => {
  it('give every withholding code of ubl-tr the rate GİB pairs with it', () => {
    for (const [code, { rate }] of Object.entries(WITHHOLDING_TAX_CODES)) {
      expect(WITHHOLDING_TAX_TYPE_CODES, code).toContain(code);
      expect(WITHHOLDING_CODE_PERCENTS, code).toContain(`${code}${rate}`);
    }
  });

  it('name every withholding code GİB accepts in WITHHOLDING_TAX_CODES', () => {
    expect([...WITHHOLDING_TAX_TYPE_CODES].sort()).toEqual(
      Object.keys(WITHHOLDING_TAX_CODES).sort(),
    );
  });
});
