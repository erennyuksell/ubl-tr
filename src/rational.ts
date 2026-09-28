// Exact integer arithmetic for the calculator: kuruş amounts times percent rates.
//
// A rate such as 20 or 2.5 is turned into an exact fraction (20/100, 25/1000) so that
// `amount × rate` is computed without float error and rounded half away from zero once.
// BigInt: kuruş × kuruş products (proportional splits) pass 2^53.

/** Most decimals a rate may carry (0.000001%). */
const RATE_DECIMALS = 6;

/** `value` as an exact fraction numerator / denominator, `value` having at most six decimals. */
export function decimalFraction(value: number): { num: bigint; den: bigint } {
  const scale = 10 ** RATE_DECIMALS;
  const scaled = Math.round(Number((value * scale).toPrecision(15)));
  return { num: BigInt(scaled), den: BigInt(scale) };
}

/** `rate`% as an exact fraction: 20 → 20/100. */
export function percentFraction(rate: number): { num: bigint; den: bigint } {
  const { num, den } = decimalFraction(rate);
  return { num, den: den * 100n };
}

/** num / den rounded half away from zero; den > 0. */
export function divRoundHalfAway(num: bigint, den: bigint): bigint {
  const negative = num < 0n;
  const abs = negative ? -num : num;
  const quotient = (abs * 2n + den) / (den * 2n);
  return negative ? -quotient : quotient;
}

/** `rate`% of `minor`, rounded half away from zero to a whole minor unit (4015 × 10% → 402). */
export function percentOfMinor(minor: number, rate: number): number {
  const { num, den } = percentFraction(rate);
  return Number(divRoundHalfAway(BigInt(minor) * num, den));
}

/**
 * The `rate`% part of an amount that already includes it, rounded half away from zero to a whole
 * minor unit: `minor × rate / (100 + rate)` (100005 at 20% → 16668, the VAT inside 1000.05).
 */
export function includedPercentOfMinor(minor: number, rate: number): number {
  const { num, den } = percentFraction(rate);
  return Number(divRoundHalfAway(BigInt(minor) * num, den + num));
}

/**
 * The largest remainder method: `total` whole units split into integer shares, one per quota
 * `numerators[i] / denominator`. Each share is its quota's floor; the units still missing go one
 * by one to the largest fractional parts. On equal fractions the later quota goes first, which is
 * deterministic and keeps a remainder on the last line, as callers did before. Every share is its
 * quota's floor or one more, so no share is more than one unit away from its quota.
 *
 * Returns `null` when the floors leave fewer than zero or more than `numerators.length` units to
 * hand out: the quotas do not add up to `total` closely enough for that guarantee.
 */
export function largestRemainder(
  total: number,
  numerators: readonly bigint[],
  denominator: bigint,
): number[] | null {
  const shares = numerators.map((num) => num / denominator);
  const remainders = numerators.map((num, index) => num - shares[index]! * denominator);
  let missing = BigInt(total) - shares.reduce((sum, share) => sum + share, 0n);
  if (missing < 0n || missing > BigInt(numerators.length)) return null;

  const order = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) =>
      a.remainder === b.remainder ? b.index - a.index : a.remainder > b.remainder ? -1 : 1,
    );

  const result = shares.map(Number);
  for (const { index } of order) {
    if (missing === 0n) break;
    result[index]! += 1;
    missing -= 1n;
  }
  return result;
}

/**
 * `total` whole units split in proportion to `weights` (largest remainder); the shares add up to
 * `total` exactly. Weights are scaled to six decimals. All-zero weights put the total on the last
 * share.
 */
export function allocateProportionally(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const scaled = weights.map((weight) => decimalFraction(weight).num);
  const sum = scaled.reduce((acc, weight) => acc + weight, 0n);
  if (sum === 0n) return weights.map((_, index) => (index === weights.length - 1 ? total : 0));
  // Proportional quotas always leave between 0 and n − 1 units, so the result is never null.
  return largestRemainder(
    total,
    scaled.map((weight) => BigInt(total) * weight),
    sum,
  )!;
}
