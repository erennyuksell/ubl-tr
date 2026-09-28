import { RETURN_INVOICE_TYPE_CODES, WITHHOLDING_INVOICE_TYPE_CODES } from './constants';
import { computeInvoice } from './calc';
import { UblValidationError } from './errors';
import { toMinor } from './money';
import type {
  UblCalcResult,
  UblCalculatedTotals,
  UblInvoiceInput,
  UblInvoiceLine,
  UblParty,
  UblValidationIssue,
  UblValidationOptions,
  UblValidationResult,
} from './types';

export { UblValidationError } from './errors';

/** GİB invoice numbers are 16 characters (3-character series, year, 9-digit sequence). */
const GIB_INVOICE_NO_LENGTH = 16;

function isBlank(value: string | undefined): boolean {
  return value == null || value.trim() === '';
}

function addIssue(issues: UblValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function validateParty(party: UblParty, path: string, issues: UblValidationIssue[]): void {
  if (isBlank(party.vkn)) addIssue(issues, `${path}.vkn`, 'VKN/TCKN is required.');
  if (party.vkn && !/^\d{10}$|^\d{11}$/.test(party.vkn)) {
    addIssue(issues, `${path}.vkn`, 'VKN must be 10 digits or TCKN must be 11 digits.');
  }
  if (isBlank(party.title)) addIssue(issues, `${path}.title`, 'Party title is required.');
  if (!party.address) {
    addIssue(issues, `${path}.address`, 'Postal address is required.');
  } else {
    if (isBlank(party.address.city)) addIssue(issues, `${path}.address.city`, 'City is required.');
    if (isBlank(party.address.country))
      addIssue(issues, `${path}.address.country`, 'Country is required.');
  }
  if (isBlank(party.taxOffice)) addIssue(issues, `${path}.taxOffice`, 'Tax office is required.');
}

/** A given amount must equal the calculated one to the kuruş; there is no tolerance. */
function checkEqual(
  issues: UblValidationIssue[],
  path: string,
  given: number | undefined,
  expected: number,
): void {
  if (given === undefined) return;
  if (!Number.isFinite(given)) {
    addIssue(issues, path, 'Must be a finite number.');
  } else if (toMinor(given) !== toMinor(expected)) {
    addIssue(issues, path, `Expected ${expected} (calculateInvoice), got ${given}.`);
  }
}

/**
 * Amounts the caller supplied next to the business inputs (the pre-0.3.0 API). Each one must be
 * exactly what the calculator produces.
 */
function checkGivenAmounts(
  input: UblInvoiceInput,
  calc: UblCalcResult,
  issues: UblValidationIssue[],
): void {
  input.lines.forEach((line: UblInvoiceLine, index) => {
    const result = calc.lines[index];
    if (!result) return;
    const path = `lines[${index}]`;
    checkEqual(issues, `${path}.lineAmount`, line.lineAmount, result.lineAmount);
    checkEqual(issues, `${path}.taxAmount`, line.taxAmount, result.taxAmount);
    if (line.withholdingTaxRate !== undefined && line.withholdingTaxCode) {
      if (line.withholdingTaxRate !== result.withholdingTaxRate && result.withholdingTaxCode) {
        addIssue(
          issues,
          `${path}.withholdingTaxRate`,
          `Withholding code ${result.withholdingTaxCode} withholds ${result.withholdingTaxRate}% of the VAT, not ${line.withholdingTaxRate}%.`,
        );
      }
    }
    // Without a code the missing code is the problem; the amount has nothing to follow.
    if (!isBlank(line.withholdingTaxCode)) {
      checkEqual(
        issues,
        `${path}.withholdingTaxAmount`,
        line.withholdingTaxAmount,
        result.withholdingTaxAmount,
      );
    }
  });
  checkEqual(issues, 'taxExclusiveAmount', input.taxExclusiveAmount, calc.taxExclusiveAmount);
  checkEqual(issues, 'taxAmount', input.taxAmount, calc.taxTotalAmount);
  checkEqual(issues, 'discount', input.discount, calc.allowanceTotalAmount);
  checkEqual(issues, 'payableAmount', input.payableAmount, calc.payableAmount);
}

/** Withholding data without a code: the rate would have nothing to come from. */
function checkWithholdingCodes(input: UblInvoiceInput, issues: UblValidationIssue[]): void {
  input.lines.forEach((line, index) => {
    const legacy = (line.withholdingTaxAmount ?? 0) !== 0 || (line.withholdingTaxRate ?? 0) !== 0;
    if (legacy && isBlank(line.withholdingTaxCode)) {
      addIssue(
        issues,
        `lines[${index}].withholdingTaxCode`,
        'Withholding tax code is required (GİB tevkifat code such as 601-627 or 801-825).',
      );
    }
  });
}

/**
 * The calculation and the problems that make it impossible to write a correct document:
 * the calculator's own, and withholding data without a tevkifat code. The builder stops on these
 * even with `validate: false`.
 */
export function calculateForBuild(
  input: UblInvoiceInput,
  options: UblValidationOptions = {},
): { calc: UblCalcResult; issues: UblValidationIssue[] } {
  const { result: calc, issues } = computeInvoice(input, options);
  checkWithholdingCodes(input, issues);
  return { calc, issues };
}

/**
 * Invoice totals from the lines, via `calculateInvoice`.
 *
 * `taxAmount` is VAT after withholding and `payableAmount` is TaxInclusiveAmount − withholding.
 * Throws `UblValidationError` when a line cannot be computed.
 *
 * @deprecated Use `calculateInvoice`, which returns every amount of the document.
 */
export function calculateInvoiceTotals(
  lines: UblInvoiceLine[],
  options: UblValidationOptions = {},
): UblCalculatedTotals {
  const { result, issues } = computeInvoice({ lines }, options);
  if (issues.length > 0) throw new UblValidationError(issues);
  return {
    taxExclusiveAmount: result.taxExclusiveAmount,
    taxAmount: result.taxTotalAmount,
    discount: result.allowanceTotalAmount,
    payableAmount: result.payableAmount,
  };
}

/**
 * Validates an invoice input and returns every problem: missing header and party data, the
 * calculator's input problems, and any supplied amount that differs from what `calculateInvoice`
 * produces (exactly, no tolerance).
 */
export function validateUblInvoiceInput(
  input: UblInvoiceInput,
  options: UblValidationOptions = {},
): UblValidationResult {
  const issues: UblValidationIssue[] = [];

  if (isBlank(input.invoiceNo) && !options.providerAssignedInvoiceNo) {
    addIssue(issues, 'invoiceNo', 'Invoice number is required.');
  }
  if (!(input.issueDate instanceof Date) || Number.isNaN(input.issueDate.getTime())) {
    addIssue(issues, 'issueDate', 'Issue date must be a valid Date.');
  }
  if (isBlank(input.profileId)) addIssue(issues, 'profileId', 'ProfileID is required.');
  if (isBlank(input.invoiceTypeCode))
    addIssue(issues, 'invoiceTypeCode', 'InvoiceTypeCode is required.');

  validateParty(input.supplier, 'supplier', issues);
  validateParty(input.customer, 'customer', issues);

  const { calc, issues: calcIssues } = calculateForBuild(input, options);
  issues.push(...calcIssues);
  checkGivenAmounts(input, calc, issues);

  if (
    calc.lines.some((line) => line.withholdingTaxCode) &&
    !WITHHOLDING_INVOICE_TYPE_CODES.includes(input.invoiceTypeCode)
  ) {
    addIssue(
      issues,
      'invoiceTypeCode',
      `Withholding lines need a withholding invoice type such as TEVKIFAT, not ${input.invoiceTypeCode}.`,
    );
  }

  if (RETURN_INVOICE_TYPE_CODES.includes(input.invoiceTypeCode)) {
    const reference = input.billingReferenceInvoiceNo?.trim() ?? '';
    if (reference.length !== GIB_INVOICE_NO_LENGTH) {
      addIssue(
        issues,
        'billingReferenceInvoiceNo',
        `${input.invoiceTypeCode} needs the returned invoice's 16-character GİB number.`,
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function assertValidUblInvoiceInput(
  input: UblInvoiceInput,
  options: UblValidationOptions = {},
): void {
  const result = validateUblInvoiceInput(input, options);
  if (!result.valid) {
    throw new UblValidationError(result.issues);
  }
}
