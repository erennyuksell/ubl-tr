import {
  BUYER_PARTY_TYPES,
  COUNTRY_CODES,
  INVOICE_TYPE_PROFILE_IDS,
  PROFILE_INVOICE_TYPE_CODES,
  RETURN_INVOICE_TYPE_CODES,
  WITHHOLDING_INVOICE_TYPE_CODES,
} from './constants';
import { computeInvoice } from './calc';
import { UblValidationError } from './errors';
import { toMinor } from './money';
import { isValidTaxId } from './identity';
import type {
  UblAddress,
  UblBillingReference,
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

/**
 * Characters XML 1.0 does not allow (C0 controls other than tab, line feed and carriage return, and the two
 * non-characters). A document holding one is not well-formed: GİB and most parsers refuse it. They come in with
 * pasted text.
 */
// eslint-disable-next-line no-control-regex -- matching these characters is the point.
const XML_FORBIDDEN_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

/** The invoices a return refers to: `billingReferences`, and the deprecated single reference, without repeats. */
export function returnReferences(input: UblInvoiceInput): UblBillingReference[] {
  const single = input.billingReferenceInvoiceNo?.trim();
  const all: UblBillingReference[] = [
    ...(single
      ? [
          {
            invoiceNo: single,
            ...(input.billingReferenceIssueDate
              ? { issueDate: input.billingReferenceIssueDate }
              : {}),
          },
        ]
      : []),
    ...(input.billingReferences ?? []),
  ];
  const seen = new Set<string>();
  return all
    .map((reference) => ({ ...reference, invoiceNo: reference.invoiceNo.trim() }))
    .filter(
      (reference) => !seen.has(reference.invoiceNo) && Boolean(seen.add(reference.invoiceNo)),
    );
}

/** The invoice type against the profile, both ways, as GİB's schematron pairs them. */
function checkProfileAndType(input: UblInvoiceInput, issues: UblValidationIssue[]): void {
  const { profileId, invoiceTypeCode } = input;
  if (isBlank(profileId) || isBlank(invoiceTypeCode)) return;
  const typesOfProfile = PROFILE_INVOICE_TYPE_CODES[profileId];
  const profilesOfType = INVOICE_TYPE_PROFILE_IDS[invoiceTypeCode];
  if (typesOfProfile && !typesOfProfile.includes(invoiceTypeCode)) {
    addIssue(
      issues,
      'invoiceTypeCode',
      `${profileId} allows only ${typesOfProfile.join(', ')}, not ${invoiceTypeCode}.`,
    );
  } else if (profilesOfType && !profilesOfType.includes(profileId)) {
    addIssue(
      issues,
      'profileId',
      `${invoiceTypeCode} can be issued only under ${profilesOfType.join(', ')}, not ${profileId}.`,
    );
  }
}

/** A VKN/TCKN: 10 or 11 digits with matching check digits. */
function checkTaxId(vkn: string, path: string, issues: UblValidationIssue[]): void {
  if (!/^\d{10}$|^\d{11}$/.test(vkn)) {
    addIssue(issues, path, 'VKN must be 10 digits or TCKN must be 11 digits.');
  } else if (!isValidTaxId(vkn)) {
    addIssue(issues, path, 'VKN/TCKN check digits do not match; the number is mistyped.');
  }
}

function checkAddress(
  address: UblAddress | undefined,
  path: string,
  issues: UblValidationIssue[],
): void {
  if (!address) {
    addIssue(issues, path, 'Postal address is required.');
    return;
  }
  if (isBlank(address.city)) addIssue(issues, `${path}.city`, 'City is required.');
  if (isBlank(address.country)) addIssue(issues, `${path}.country`, 'Country is required.');
}

/**
 * The buyer of an export or a tax-free sale, as GİB's schematron asks for it: an IHRACAT invoice names
 * the foreign buyer with its official name, a YOLCUBERABERFATURA invoice the tourist (name, nationality,
 * passport) and the intermediary (VKN and GİB alias). A foreign buyer has no VKN or tax office.
 */
function checkBuyer(input: UblInvoiceInput, issues: UblValidationIssue[]): void {
  const { buyerCustomer: buyer, profileId } = input;
  const partyType = BUYER_PARTY_TYPES[profileId];
  if (!buyer) {
    if (partyType)
      addIssue(issues, 'buyerCustomer', `${profileId} needs the buyer (${partyType}).`);
  } else {
    checkAddress(buyer.address, 'buyerCustomer.address', issues);
    if (buyer.vkn?.trim()) checkTaxId(buyer.vkn.trim(), 'buyerCustomer.vkn', issues);
    // cac:PartyIdentification is required: outside these profiles nothing writes the party type.
    if (!partyType && isBlank(buyer.vkn) && !buyer.additionalIds?.length) {
      addIssue(
        issues,
        'buyerCustomer.vkn',
        'A buyer needs a VKN/TCKN or another identification outside IHRACAT and YOLCUBERABERFATURA.',
      );
    }
  }

  if (profileId === 'IHRACAT' && buyer && isBlank(buyer.legalEntity?.registrationName)) {
    addIssue(
      issues,
      'buyerCustomer.legalEntity.registrationName',
      "IHRACAT needs the buyer's official name.",
    );
  }

  if (profileId === 'YOLCUBERABERFATURA') {
    const person = buyer?.person;
    if (buyer && (!person || isBlank(person.firstName) || isBlank(person.familyName))) {
      addIssue(
        issues,
        'buyerCustomer.person',
        "YOLCUBERABERFATURA needs the tourist's first and family name.",
      );
    }
    if (person && !COUNTRY_CODES.includes(person.nationalityId ?? '')) {
      addIssue(
        issues,
        'buyerCustomer.person.nationalityId',
        "Nationality must be a country code from GİB's list (COUNTRY_CODES).",
      );
    }
    if (
      person &&
      (isBlank(person.passport?.id) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(person.passport?.issueDate ?? ''))
    ) {
      addIssue(
        issues,
        'buyerCustomer.person.passport',
        'The passport number and its issue date (YYYY-MM-DD) are required.',
      );
    }
    const representative = input.taxRepresentative;
    if (!representative) {
      addIssue(
        issues,
        'taxRepresentative',
        'YOLCUBERABERFATURA needs the intermediary (aracı kurum).',
      );
    } else {
      checkTaxId(representative.vkn.trim(), 'taxRepresentative.vkn', issues);
      if (isBlank(representative.alias))
        addIssue(issues, 'taxRepresentative.alias', "The intermediary's GİB alias is required.");
      checkAddress(representative.address, 'taxRepresentative.address', issues);
    }
  }
}

/** Every string in the input that holds a character XML cannot carry, by its path. */
function checkXmlText(value: unknown, path: string, issues: UblValidationIssue[]): void {
  if (typeof value === 'string') {
    if (XML_FORBIDDEN_CHARACTERS.test(value)) {
      addIssue(
        issues,
        path,
        'Contains a control character XML does not allow (often from pasted text).',
      );
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => checkXmlText(item, `${path}[${index}]`, issues));
  } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    for (const [key, child] of Object.entries(value))
      checkXmlText(child, path ? `${path}.${key}` : key, issues);
  }
}

function isBlank(value: string | undefined): boolean {
  return value == null || value.trim() === '';
}

function addIssue(issues: UblValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function validateParty(party: UblParty, path: string, issues: UblValidationIssue[]): void {
  if (isBlank(party.vkn)) addIssue(issues, `${path}.vkn`, 'VKN/TCKN is required.');
  else checkTaxId(party.vkn, `${path}.vkn`, issues);
  if (isBlank(party.title)) addIssue(issues, `${path}.title`, 'Party title is required.');
  checkAddress(party.address, `${path}.address`, issues);
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

  checkProfileAndType(input, issues);
  validateParty(input.supplier, 'supplier', issues);
  validateParty(input.customer, 'customer', issues);
  checkBuyer(input, issues);
  checkXmlText(input, '', issues);

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
    const references = returnReferences(input);
    if (!references.length) {
      addIssue(
        issues,
        'billingReferences',
        `${input.invoiceTypeCode} needs the returned invoice's 16-character GİB number.`,
      );
    }
    references.forEach((reference, index) => {
      if (reference.invoiceNo.length !== GIB_INVOICE_NO_LENGTH) {
        addIssue(
          issues,
          `billingReferences[${index}].invoiceNo`,
          'A returned invoice number is 16 characters.',
        );
      }
    });
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
