import type {
  UblCalculatedTotals,
  UblInvoiceInput,
  UblInvoiceLine,
  UblParty,
  UblValidationIssue,
  UblValidationResult,
} from './types';

const DEFAULT_TOLERANCE = 0.01;

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isBlank(value: string | undefined): boolean {
  return value == null || value.trim() === '';
}

function addIssue(issues: UblValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function isClose(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
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

function validateLine(
  line: UblInvoiceLine,
  index: number,
  issues: UblValidationIssue[],
  tolerance: number,
): void {
  const path = `lines[${index}]`;
  if (isBlank(line.name)) addIssue(issues, `${path}.name`, 'Line name is required.');

  for (const [field, value] of [
    ['quantity', line.quantity],
    ['price', line.price],
    ['lineAmount', line.lineAmount],
    ['vatRate', line.vatRate],
    ['taxAmount', line.taxAmount],
  ] as const) {
    if (!isFiniteNumber(value)) addIssue(issues, `${path}.${field}`, 'Must be a finite number.');
  }

  if (line.quantity <= 0)
    addIssue(issues, `${path}.quantity`, 'Quantity must be greater than zero.');
  if (line.price < 0) addIssue(issues, `${path}.price`, 'Price cannot be negative.');
  if (line.lineAmount < 0)
    addIssue(issues, `${path}.lineAmount`, 'Line amount cannot be negative.');
  if (line.vatRate < 0) addIssue(issues, `${path}.vatRate`, 'VAT rate cannot be negative.');
  if (line.taxAmount < 0) addIssue(issues, `${path}.taxAmount`, 'Tax amount cannot be negative.');

  const expectedLineAmount = roundMoney(
    line.quantity * line.price - (line.discount ?? 0) + (line.surchargeAmount ?? 0),
  );
  if (!isClose(line.lineAmount, expectedLineAmount, tolerance)) {
    addIssue(
      issues,
      `${path}.lineAmount`,
      `Expected ${expectedLineAmount} from quantity, price, discount, and surcharge.`,
    );
  }

  const expectedTaxAmount = roundMoney(line.lineAmount * (line.vatRate / 100));
  if (!line.taxExemptionReasonCode && !isClose(line.taxAmount, expectedTaxAmount, tolerance)) {
    addIssue(
      issues,
      `${path}.taxAmount`,
      `Expected ${expectedTaxAmount} from lineAmount and vatRate.`,
    );
  }
}

export function calculateInvoiceTotals(lines: UblInvoiceLine[]): UblCalculatedTotals {
  const taxExclusiveAmount = roundMoney(lines.reduce((sum, line) => sum + line.lineAmount, 0));
  const taxAmount = roundMoney(
    lines.reduce((sum, line) => sum + line.taxAmount - (line.withholdingTaxAmount ?? 0), 0),
  );
  const discount = roundMoney(lines.reduce((sum, line) => sum + (line.discount ?? 0), 0));
  const payableAmount = roundMoney(taxExclusiveAmount + taxAmount);

  return {
    taxExclusiveAmount,
    taxAmount,
    discount,
    payableAmount,
  };
}

export function validateUblInvoiceInput(
  input: UblInvoiceInput,
  tolerance = DEFAULT_TOLERANCE,
): UblValidationResult {
  const issues: UblValidationIssue[] = [];

  if (isBlank(input.invoiceNo)) addIssue(issues, 'invoiceNo', 'Invoice number is required.');
  if (!(input.issueDate instanceof Date) || Number.isNaN(input.issueDate.getTime())) {
    addIssue(issues, 'issueDate', 'Issue date must be a valid Date.');
  }
  if (isBlank(input.profileId)) addIssue(issues, 'profileId', 'ProfileID is required.');
  if (isBlank(input.invoiceTypeCode))
    addIssue(issues, 'invoiceTypeCode', 'InvoiceTypeCode is required.');
  if (input.lines.length === 0) addIssue(issues, 'lines', 'At least one invoice line is required.');

  validateParty(input.supplier, 'supplier', issues);
  validateParty(input.customer, 'customer', issues);
  input.lines.forEach((line, index) => validateLine(line, index, issues, tolerance));

  const totals = calculateInvoiceTotals(input.lines);
  if (!isClose(input.taxExclusiveAmount, totals.taxExclusiveAmount, tolerance)) {
    addIssue(
      issues,
      'taxExclusiveAmount',
      `Expected ${totals.taxExclusiveAmount} from invoice lines.`,
    );
  }
  if (!isClose(input.taxAmount, totals.taxAmount, tolerance)) {
    addIssue(issues, 'taxAmount', `Expected ${totals.taxAmount} from invoice lines.`);
  }
  if (!isClose(input.discount, totals.discount, tolerance)) {
    addIssue(issues, 'discount', `Expected ${totals.discount} from invoice lines.`);
  }
  if (!isClose(input.payableAmount, totals.payableAmount, tolerance)) {
    addIssue(issues, 'payableAmount', `Expected ${totals.payableAmount} from invoice lines.`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export class UblValidationError extends Error {
  readonly issues: UblValidationIssue[];

  constructor(issues: UblValidationIssue[]) {
    super(
      `Invalid UBL-TR invoice input: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
    );
    this.name = 'UblValidationError';
    this.issues = issues;
  }
}

export function assertValidUblInvoiceInput(
  input: UblInvoiceInput,
  tolerance = DEFAULT_TOLERANCE,
): void {
  const result = validateUblInvoiceInput(input, tolerance);
  if (!result.valid) {
    throw new UblValidationError(result.issues);
  }
}
