// The invoice calculator: every amount a UBL-TR invoice carries, from the business inputs.
//
// Callers decide the facts (quantity, price or a VAT-inclusive line amount, discount and
// surcharge rates or amounts, VAT rate, tevkifat code, document discounts); this module turns
// them into line amounts, VAT, withholding and document totals. The builder writes nothing else.
// All sums are in whole kuruş, every rounding is half away from zero and happens once.

import { DEFAULT_TAX_TYPE_CODE, WITHHOLDING_TAX_CODES } from './constants';
import { UblValidationError } from './errors';
import { PRICE_DECIMALS, fromMinor, roundTo, toMinor } from './money';
import {
  allocateProportionally,
  divRoundHalfAway,
  includedPercentOfMinor,
  largestRemainder,
  percentFraction,
  percentOfMinor,
} from './rational';
import type {
  UblCalcAllowanceCharge,
  UblCalcInput,
  UblCalcLine,
  UblCalcLineResult,
  UblCalcOptions,
  UblCalcResult,
  UblCalcTaxSubtotal,
  UblCalcWithholdingSubtotal,
  UblValidationIssue,
} from './types';

/** Decimals kept on MultiplierFactorNumeric (0.05 is 5%). */
const FACTOR_DECIMALS = 6;

function finite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * AllowanceCharge rate as GİB writes it: a fraction, 0.05 for 5% (TicariFaturaOrnegi.xml).
 * The stated percent is used when it reproduces the amount to the kuruş; otherwise the factor
 * is derived from the amounts so that the two never disagree.
 */
function multiplierFactor(
  amountMinor: number,
  baseMinor: number,
  percent?: number,
): number | undefined {
  if (finite(percent) && percent > 0 && percentOfMinor(baseMinor, percent) === amountMinor) {
    return roundTo(percent / 100, FACTOR_DECIMALS);
  }
  if (baseMinor <= 0) return undefined;
  return roundTo(amountMinor / baseMinor, FACTOR_DECIMALS);
}

interface WorkingLine {
  source: UblCalcLine;
  price: number;
  quantity: number;
  grossMinor: number;
  charges: Array<UblCalcAllowanceCharge & { amountMinor: number; baseMinor: number }>;
  netMinor: number;
  vatMinor: number;
  /** VAT taken out of `vatInclusiveAmount`; the line's total is fixed. */
  inclusiveVatMinor?: number;
  withholdingCode?: string;
  withholdingRate: number;
  withholdingMinor: number;
}

/** Checks the numeric inputs of a line; returns false when the line cannot be computed. */
function checkLineInputs(line: UblCalcLine, path: string, issues: UblValidationIssue[]): boolean {
  const add = (field: string, message: string) =>
    issues.push({ path: `${path}.${field}`, message });
  let ok = true;
  const inclusive = line.vatInclusiveAmount !== undefined;
  const fields: Array<[string, number | undefined, boolean]> = [
    ['quantity', line.quantity, true],
    ['price', line.price, !inclusive],
    ['vatInclusiveAmount', line.vatInclusiveAmount, false],
    ['vatRate', line.vatRate, true],
    ['discount', line.discount, false],
    ['discountRate', line.discountRate, false],
    ['surchargeAmount', line.surchargeAmount, false],
    ['surchargeRate', line.surchargeRate, false],
  ];
  for (const [field, value, required] of fields) {
    if (value === undefined && !required) continue;
    if (!finite(value)) {
      add(field, 'Must be a finite number.');
      ok = false;
    }
  }
  if (!ok) return false;
  if (line.quantity <= 0) add('quantity', 'Quantity must be greater than zero.');
  if (!inclusive && line.price < 0) add('price', 'Price cannot be negative.');
  if (inclusive && line.vatInclusiveAmount! < 0) add('vatInclusiveAmount', 'Cannot be negative.');
  if (inclusive) {
    for (const field of ['discountRate', 'surchargeRate'] as const) {
      if (line[field] !== undefined && line[field] !== 0) {
        add(field, 'Give the amount instead of a rate on a line with vatInclusiveAmount.');
      }
    }
  }
  if (line.vatRate < 0 || line.vatRate > 100) add('vatRate', 'VAT rate must be 0 to 100.');
  for (const field of ['discount', 'surchargeAmount'] as const) {
    if ((line[field] ?? 0) < 0) add(field, 'Cannot be negative.');
  }
  for (const field of ['discountRate', 'surchargeRate'] as const) {
    const rate = line[field] ?? 0;
    if (rate < 0 || rate > 100) add(field, 'Rate must be 0 to 100.');
  }
  return (
    line.quantity > 0 &&
    (inclusive ? line.vatInclusiveAmount! >= 0 : line.price >= 0) &&
    line.vatRate >= 0 &&
    line.vatRate <= 100
  );
}

/**
 * Computes the invoice and collects problems instead of throwing. `calculateInvoice` throws when
 * `issues` is not empty; validation reports them next to its own.
 */
export function computeInvoice(
  input: UblCalcInput,
  options: UblCalcOptions = {},
): { result: UblCalcResult; issues: UblValidationIssue[] } {
  const rounding = options.rounding ?? 'line';
  const issues: UblValidationIssue[] = [];

  // ── Lines: price, gross, line allowances and charges ──────────
  const lines: WorkingLine[] = input.lines.map((line, index) => {
    const path = `lines[${index}]`;
    const usable = checkLineInputs(line, path, issues);
    const quantity = usable ? line.quantity : 0;
    const discountGiven = finite(line.discount) ? Math.max(0, toMinor(line.discount)) : undefined;
    const surchargeGiven = finite(line.surchargeAmount)
      ? Math.max(0, toMinor(line.surchargeAmount))
      : undefined;

    // A VAT-inclusive line: its total is fixed, the VAT comes out of it and the net is the rest.
    // The unit price is what that net comes from once the line's discount and surcharge are
    // taken back (both amounts, VAT-exclusive).
    let price: number;
    let grossMinor: number;
    let inclusiveVatMinor: number | undefined;
    if (usable && line.vatInclusiveAmount !== undefined) {
      const totalMinor = toMinor(line.vatInclusiveAmount);
      inclusiveVatMinor = includedPercentOfMinor(totalMinor, line.vatRate);
      grossMinor = totalMinor - inclusiveVatMinor + (discountGiven ?? 0) - (surchargeGiven ?? 0);
      price = grossMinor > 0 ? roundTo(grossMinor / 100 / quantity, PRICE_DECIMALS) : 0;
    } else {
      price = roundTo(usable ? line.price : 0, PRICE_DECIMALS);
      grossMinor = toMinor(quantity * price);
    }

    const charges: WorkingLine['charges'] = [];
    const discountMinor =
      discountGiven ??
      (finite(line.discountRate) && line.discountRate > 0
        ? percentOfMinor(grossMinor, line.discountRate)
        : 0);
    if (discountMinor > 0) {
      charges.push({
        isCharge: false,
        amount: fromMinor(discountMinor),
        baseAmount: fromMinor(grossMinor),
        amountMinor: discountMinor,
        baseMinor: grossMinor,
        fromDocument: false,
        ...withFactor(multiplierFactor(discountMinor, grossMinor, line.discountRate)),
      });
    }
    const surchargeMinor =
      surchargeGiven ??
      (finite(line.surchargeRate) && line.surchargeRate > 0
        ? percentOfMinor(grossMinor, line.surchargeRate)
        : 0);
    if (surchargeMinor > 0) {
      charges.push({
        isCharge: true,
        amount: fromMinor(surchargeMinor),
        baseAmount: fromMinor(grossMinor),
        amountMinor: surchargeMinor,
        baseMinor: grossMinor,
        fromDocument: false,
        ...withFactor(multiplierFactor(surchargeMinor, grossMinor, line.surchargeRate)),
      });
    }

    const netMinor = grossMinor - discountMinor + surchargeMinor;
    if (grossMinor < 0 || netMinor < 0) {
      issues.push({
        path: `${path}.discount`,
        message: `Discount ${fromMinor(discountMinor)} exceeds the line's ${fromMinor(grossMinor + surchargeMinor)}.`,
      });
    }

    return {
      source: line,
      price,
      quantity,
      grossMinor,
      charges,
      netMinor: Math.max(0, netMinor),
      vatMinor: 0,
      ...(inclusiveVatMinor !== undefined ? { inclusiveVatMinor } : {}),
      withholdingRate: 0,
      withholdingMinor: 0,
    };
  });

  // A VAT-inclusive line's total is fixed: a document allowance or a group rounding would move it.
  const hasInclusive = lines.some((line) => line.inclusiveVatMinor !== undefined);
  if (hasInclusive && (input.headerAllowanceCharges ?? []).length > 0) {
    issues.push({
      path: 'headerAllowanceCharges',
      message: 'Not combined with vatInclusiveAmount lines: put the discount on the lines.',
    });
  }
  if (hasInclusive && rounding === 'document') {
    issues.push({
      path: 'rounding',
      message: "'document' rounding is not combined with vatInclusiveAmount lines.",
    });
  }

  // ── Document allowances and charges, spread over the lines by net amount ──
  const documentBaseMinor = lines.reduce((sum, line) => sum + line.netMinor, 0);
  (hasInclusive ? [] : (input.headerAllowanceCharges ?? [])).forEach((ac, index) => {
    const path = `headerAllowanceCharges[${index}]`;
    if (ac.amount != null && (!finite(ac.amount) || ac.amount < 0)) {
      issues.push({ path: `${path}.amount`, message: 'Must be a non-negative number.' });
      return;
    }
    if (ac.percent != null && (!finite(ac.percent) || ac.percent < 0 || ac.percent > 100)) {
      issues.push({ path: `${path}.percent`, message: 'Must be 0 to 100.' });
      return;
    }
    if (ac.baseAmount != null && toMinor(ac.baseAmount) !== documentBaseMinor) {
      issues.push({
        path: `${path}.baseAmount`,
        message: `Expected ${fromMinor(documentBaseMinor)}, the lines' net total.`,
      });
    }
    const amountMinor =
      ac.amount != null
        ? toMinor(ac.amount)
        : ac.percent != null
          ? percentOfMinor(documentBaseMinor, ac.percent)
          : 0;
    if (amountMinor === 0) return;
    const available = lines.reduce((sum, line) => sum + line.netMinor, 0);
    if (!ac.isCharge && amountMinor > available) {
      issues.push({
        path: `${path}.amount`,
        message: `Document discount ${fromMinor(amountMinor)} exceeds the lines' ${fromMinor(available)}.`,
      });
      return;
    }
    const shares = allocateProportionally(
      amountMinor,
      lines.map((line) => line.netMinor),
    );
    lines.forEach((line, lineIndex) => {
      const share = shares[lineIndex]!;
      if (share === 0) return;
      line.charges.push({
        isCharge: ac.isCharge,
        ...(ac.reason ? { reason: ac.reason } : {}),
        amount: fromMinor(share),
        baseAmount: fromMinor(line.netMinor),
        amountMinor: share,
        baseMinor: line.netMinor,
        fromDocument: true,
        ...withFactor(multiplierFactor(share, line.netMinor)),
      });
      line.netMinor += ac.isCharge ? share : -share;
    });
  });

  // ── VAT ────────────────────────────────────────────────────────
  lines.forEach((line) => {
    line.vatMinor = line.inclusiveVatMinor ?? percentOfMinor(line.netMinor, line.source.vatRate);
  });

  if (rounding === 'document' && !hasInclusive) {
    // One rounding per rate group; the group VAT is spread over its lines by their exact VAT.
    const groups = new Map<string, number[]>();
    lines.forEach((line, index) => {
      const key = groupKey(line.source);
      groups.set(key, [...(groups.get(key) ?? []), index]);
    });
    for (const indexes of groups.values()) {
      const { num, den } = percentFraction(lines[indexes[0]!]!.source.vatRate);
      const numerators = indexes.map((index) => BigInt(lines[index]!.netMinor) * num);
      const groupNet = indexes.reduce((sum, index) => sum + lines[index]!.netMinor, 0);
      const groupVat = Number(divRoundHalfAway(BigInt(groupNet) * num, den));
      // round(Σ exact) − Σ floor(exact) is always between 0 and the line count.
      const shares = largestRemainder(groupVat, numerators, den)!;
      indexes.forEach((index, position) => {
        lines[index]!.vatMinor = shares[position]!;
      });
    }
  }

  // ── Withholding (tevkifat): rate from the code, one rounding of VAT × rate ──
  lines.forEach((line, index) => {
    const source = line.source;
    const code = source.withholdingTaxCode?.trim() ?? '';
    if (code === '') return;
    const known = WITHHOLDING_TAX_CODES[code];
    if (!known) {
      issues.push({
        path: `lines[${index}].withholdingTaxCode`,
        message: `Unknown withholding tax code ${code}; see WITHHOLDING_TAX_CODES.`,
      });
      return;
    }
    line.withholdingCode = code;
    line.withholdingRate = known.rate;
    line.withholdingMinor = percentOfMinor(line.vatMinor, known.rate);
  });

  // ── Totals ─────────────────────────────────────────────────────
  const sum = (pick: (line: WorkingLine) => number) =>
    lines.reduce((total, line) => total + pick(line), 0);
  const sumCharges = (isCharge: boolean) =>
    sum((line) =>
      line.charges
        .filter((charge) => charge.isCharge === isCharge)
        .reduce((total, charge) => total + charge.amountMinor, 0),
    );

  const netMinor = sum((line) => line.netMinor);
  const allowanceMinor = sumCharges(false);
  const chargeMinor = sumCharges(true);
  const vatMinor = sum((line) => line.vatMinor);
  const withholdingMinor = sum((line) => line.withholdingMinor);
  const roundingMinor = payableRoundingMinor(input.payableRoundingAmount, lines.length, issues);

  const taxGroups = new Map<
    string,
    UblCalcTaxSubtotal & { taxableMinor: number; taxMinor: number }
  >();
  for (const line of lines) {
    const key = groupKey(line.source);
    const group = taxGroups.get(key) ?? {
      vatRate: line.source.vatRate,
      taxTypeCode: line.source.taxTypeCode ?? DEFAULT_TAX_TYPE_CODE,
      ...(line.source.taxExemptionReasonCode
        ? { taxExemptionReasonCode: line.source.taxExemptionReasonCode }
        : {}),
      ...(line.source.taxExemptionReason
        ? { taxExemptionReason: line.source.taxExemptionReason }
        : {}),
      taxableAmount: 0,
      taxAmount: 0,
      taxableMinor: 0,
      taxMinor: 0,
    };
    group.taxableMinor += line.netMinor;
    group.taxMinor += line.vatMinor;
    taxGroups.set(key, group);
  }

  const withholdingGroups = new Map<
    string,
    UblCalcWithholdingSubtotal & { taxableMinor: number; taxMinor: number }
  >();
  for (const line of lines) {
    if (!line.withholdingCode || line.withholdingMinor === 0) continue;
    const key = `${line.withholdingCode}_${line.withholdingRate}`;
    const group = withholdingGroups.get(key) ?? {
      code: line.withholdingCode,
      rate: line.withholdingRate,
      taxableAmount: 0,
      taxAmount: 0,
      taxableMinor: 0,
      taxMinor: 0,
    };
    group.taxableMinor += line.vatMinor;
    group.taxMinor += line.withholdingMinor;
    withholdingGroups.set(key, group);
  }

  const result: UblCalcResult = {
    lines: lines.map(
      (line): UblCalcLineResult => ({
        price: line.price,
        quantity: line.quantity,
        grossAmount: fromMinor(line.grossMinor),
        allowanceCharges: line.charges.map(publicCharge),
        discount: fromMinor(
          line.charges.filter((c) => !c.isCharge).reduce((t, c) => t + c.amountMinor, 0),
        ),
        surchargeAmount: fromMinor(
          line.charges.filter((c) => c.isCharge).reduce((t, c) => t + c.amountMinor, 0),
        ),
        lineAmount: fromMinor(line.netMinor),
        vatRate: line.source.vatRate,
        taxTypeCode: line.source.taxTypeCode ?? DEFAULT_TAX_TYPE_CODE,
        taxAmount: fromMinor(line.vatMinor),
        ...(line.withholdingCode ? { withholdingTaxCode: line.withholdingCode } : {}),
        withholdingTaxRate: line.withholdingRate,
        withholdingTaxAmount: fromMinor(line.withholdingMinor),
      }),
    ),
    lineExtensionAmount: fromMinor(netMinor + allowanceMinor),
    allowanceTotalAmount: fromMinor(allowanceMinor),
    chargeTotalAmount: fromMinor(chargeMinor),
    taxExclusiveAmount: fromMinor(netMinor),
    vatAmount: fromMinor(vatMinor),
    taxInclusiveAmount: fromMinor(netMinor + vatMinor),
    taxTotalAmount: fromMinor(vatMinor - withholdingMinor),
    taxSubtotals: [...taxGroups.values()].map(({ taxableMinor, taxMinor, ...group }) => ({
      ...group,
      taxableAmount: fromMinor(taxableMinor),
      taxAmount: fromMinor(taxMinor),
    })),
    withholdingTaxAmount: fromMinor(withholdingMinor),
    withholdingSubtotals: [...withholdingGroups.values()].map(
      ({ taxableMinor, taxMinor, ...group }) => ({
        ...group,
        taxableAmount: fromMinor(taxableMinor),
        taxAmount: fromMinor(taxMinor),
      }),
    ),
    payableRoundingAmount: fromMinor(roundingMinor),
    payableAmount: fromMinor(netMinor + vatMinor - withholdingMinor + roundingMinor),
  };

  if (lines.length === 0)
    issues.push({ path: 'lines', message: 'At least one invoice line is required.' });

  return { result, issues };
}

/**
 * PayableRoundingAmount in kuruş: whole kuruş, at most one per line either way. A larger gap is
 * not rounding, it is a wrong document, and is reported instead of being written.
 */
function payableRoundingMinor(
  value: number | undefined,
  lineCount: number,
  issues: UblValidationIssue[],
): number {
  if (value === undefined || value === 0) return 0;
  if (!finite(value) || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    issues.push({ path: 'payableRoundingAmount', message: 'Must be a whole number of kuruş.' });
    return 0;
  }
  const minor = toMinor(value);
  if (Math.abs(minor) > Math.max(1, lineCount)) {
    issues.push({
      path: 'payableRoundingAmount',
      message: `Rounding ${fromMinor(minor)} exceeds one kuruş per line (${lineCount} line(s)).`,
    });
    return 0;
  }
  return minor;
}

/** A working charge without its kuruş bookkeeping fields. */
function publicCharge(charge: WorkingLine['charges'][number]): UblCalcAllowanceCharge {
  return {
    isCharge: charge.isCharge,
    ...(charge.reason ? { reason: charge.reason } : {}),
    amount: charge.amount,
    baseAmount: charge.baseAmount,
    ...(charge.multiplierFactor != null ? { multiplierFactor: charge.multiplierFactor } : {}),
    fromDocument: charge.fromDocument,
  };
}

function withFactor(factor: number | undefined): { multiplierFactor?: number } {
  return factor == null ? {} : { multiplierFactor: factor };
}

/** Rate group: VAT rate, tax type code and exemption code. */
function groupKey(line: UblCalcLine): string {
  return `${line.vatRate}_${line.taxTypeCode ?? DEFAULT_TAX_TYPE_CODE}_${line.taxExemptionReasonCode ?? ''}`;
}

/**
 * Every amount of the invoice from its business inputs: each line's price, discounts and
 * surcharges, net amount, VAT and withholding, and the document totals, all in whole kuruş with
 * one rounding each (half away from zero).
 *
 * - The tevkifat rate comes from `WITHHOLDING_TAX_CODES`; the withheld amount is
 *   `round(VAT × rate)`.
 * - `rounding: 'line'` (default, as in GİB's examples): each line's VAT is `round(net × rate)`.
 *   `'document'`: one `round(Σ net × rate)` per rate group, spread over its lines.
 * - A line sold at a VAT-inclusive price gives `vatInclusiveAmount`: its VAT is taken out of that
 *   amount, `round(amount × rate / (100 + rate))`, and the line comes to it exactly.
 * - A document discount or charge (`headerAllowanceCharges`) is spread over the lines by net
 *   amount, so VAT is computed on what each line really costs.
 * - No VAT amount is passed in. A fixed total that net-priced lines cannot reach (the exact
 *   reversal of an invoice issued with another rounding) is closed with `payableRoundingAmount`,
 *   one kuruş per line at most.
 *
 * Throws `UblValidationError` when an input cannot be computed (a negative amount, a discount
 * larger than the line, an unknown tevkifat code).
 */
export function calculateInvoice(input: UblCalcInput, options: UblCalcOptions = {}): UblCalcResult {
  const { result, issues } = computeInvoice(input, options);
  if (issues.length > 0) throw new UblValidationError(issues);
  return result;
}
