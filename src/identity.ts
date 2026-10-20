/**
 * Turkish tax identifiers: the 10-digit VKN of a legal entity and the 11-digit TCKN of a person, each with its
 * check digits. GİB also uses fixed placeholder numbers that do not pass the check: `11111111111` for a final
 * consumer without an identity number and `2222222222` for a foreign buyer.
 */

/** GİB's TCKN for a final consumer whose identity number is not known. */
export const FINAL_CONSUMER_TCKN = '11111111111';
/** GİB's VKN for a foreign buyer. */
export const FOREIGN_BUYER_VKN = '2222222222';

const GIB_PLACEHOLDER_IDS: ReadonlySet<string> = new Set([FINAL_CONSUMER_TCKN, FOREIGN_BUYER_VKN]);

/** A 10-digit VKN whose last digit matches the Revenue Administration's check-digit rule. */
export function isValidVkn(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const digit = (i: number) => value.charCodeAt(i) - 48;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const shifted = (digit(i) + 9 - i) % 10;
    let weighted = (shifted * 2 ** (9 - i)) % 9;
    if (shifted !== 0 && weighted === 0) weighted = 9;
    sum += weighted;
  }
  return (10 - (sum % 10)) % 10 === digit(9);
}

/** An 11-digit TCKN, not starting with 0, whose last two digits match the population registry's rule. */
export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = (i: number) => value.charCodeAt(i) - 48;
  const odd = d(0) + d(2) + d(4) + d(6) + d(8);
  const even = d(1) + d(3) + d(5) + d(7);
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  let firstTen = 0;
  for (let i = 0; i < 10; i++) firstTen += d(i);
  return d(9) === tenth && d(10) === firstTen % 10;
}

/** A valid VKN or TCKN, or one of GİB's placeholder numbers. */
export function isValidTaxId(value: string): boolean {
  return GIB_PLACEHOLDER_IDS.has(value) || isValidVkn(value) || isValidTckn(value);
}
