// Splitting amounts: the VAT inside a VAT-inclusive amount, and an amount shared by weight.

import { fromMinor, toMinor } from './money';
import { allocateProportionally, includedPercentOfMinor } from './rational';

/** A VAT-inclusive amount split into its net amount and the VAT inside it. */
export interface UblVatInclusiveSplit {
  /** Net amount: the given amount minus `taxAmount`. */
  lineAmount: number;
  /** `round(amount × rate / (100 + rate))`, half away from zero. */
  taxAmount: number;
}

/**
 * The net and the VAT of a VAT-inclusive amount, as the calculator splits a line given with
 * `vatInclusiveAmount`: the VAT is taken out of the amount, `round(amount × rate / (100 + rate))`,
 * and the net is the rest, so the two always add up to the amount (1000.05 at 20%: 833.37 net,
 * 166.68 VAT). This is how a VAT-inclusive price is invoiced: the price the customer saw is what
 * is charged and what the invoice comes to.
 *
 * @param vatRate percent (20 = 20%)
 */
export function splitVatInclusive(amount: number, vatRate: number): UblVatInclusiveSplit {
  const minor = toMinor(amount);
  if (!Number.isFinite(amount) || minor < 0) {
    throw new RangeError('splitVatInclusive: amount must be a non-negative amount.');
  }
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    throw new RangeError('splitVatInclusive: vatRate must be between 0 and 100.');
  }
  const vat = includedPercentOfMinor(minor, vatRate);
  return { lineAmount: fromMinor(minor - vat), taxAmount: fromMinor(vat) };
}

/**
 * Splits `total` in proportion to `weights`, in whole kuruş (largest remainder): the parts add up
 * to `total` exactly and each is within one kuruş of its exact share. Use it wherever an amount
 * has to be shared (a partial refund over the lines as their `vatInclusiveAmount`, a partial
 * payment between net and VAT) instead of rounding each share on its own. All-zero weights put
 * the total on the last part.
 */
export function allocateAmount(total: number, weights: readonly number[]): number[] {
  const totalMinor = toMinor(total);
  if (!Number.isFinite(total) || totalMinor < 0) {
    throw new RangeError('allocateAmount: total must be a non-negative amount.');
  }
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError('allocateAmount: weights must be non-negative numbers.');
  }
  return allocateProportionally(totalMinor, weights).map(fromMinor);
}
