// Money helpers shared by validation and the builder, exported for callers that want the same
// rounding (`roundMoney`, `toMinor`, `fromMinor`, `sumInMinor`, `roundTo`).
//
// Amounts are compared and summed in integer minor units (kuruş for TRY) so that
// float noise can never decide whether an invoice is valid. Rounding is half away
// from zero at the minor unit: 2.135 -> 2.14, 4.015 -> 4.02, -1.005 -> -1.01.
// `toFixed(2)` rounds the binary value instead (2.135 -> 2.13) and is not used.

/**
 * Decimals kept on PriceAmount. The unit price is not a total: GİB puts no two-decimal limit on
 * it and integrators accept up to eight. Cutting it to two made quantity × price disagree with
 * LineExtensionAmount (3 × 27.78 = 83.34 against 83.33).
 */
export const PRICE_DECIMALS = 8;

/** |value| scaled to `10^decimals` and rounded; the product's float noise is cleared at 15 significant digits. */
function absScaled(value: number, decimals: number): number {
  return Math.round(Number((Math.abs(value) * 10 ** decimals).toPrecision(15)));
}

/** Rounds to `decimals` places, half away from zero, never returning -0. */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const scaled = absScaled(value, decimals);
  if (scaled === 0) return 0;
  const rounded = scaled / 10 ** decimals;
  return value < 0 ? -rounded : rounded;
}

/** Rounds a money amount to two decimals (kuruş), half away from zero, never -0. */
export function roundMoney(value: number): number {
  return roundTo(value, 2);
}

/** Money amount to integer minor units (kuruş), with the same rounding as `roundMoney`. */
export function toMinor(value: number): number {
  if (!Number.isFinite(value)) return value;
  const scaled = absScaled(value, 2);
  if (scaled === 0) return 0;
  return value < 0 ? -scaled : scaled;
}

/** Integer minor units back to a money amount. */
export function fromMinor(minor: number): number {
  return roundMoney(minor / 100);
}

/** Sum of money amounts, added in minor units. */
export function sumInMinor(values: number[]): number {
  return values.reduce((sum, value) => sum + toMinor(value), 0);
}
