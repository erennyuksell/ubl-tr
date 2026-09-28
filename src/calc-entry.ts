// `@erennyuksell/ubl-tr/calc`: the invoice calculator without the XML builder and parser.
// No dependency (fast-xml-parser stays out), so a browser form can compute the same amounts the
// server will write to the UBL-TR document.

export { calculateInvoice } from './calc';
export { allocateAmount, splitVatInclusive } from './allocate';
export type { UblVatInclusiveSplit } from './allocate';
export { UblValidationError } from './errors';
export { roundMoney, roundTo, toMinor, fromMinor, sumInMinor } from './money';
export {
  WITHHOLDING_TAX_CODES,
  WITHHOLDING_INVOICE_TYPE_CODES,
  RETURN_INVOICE_TYPE_CODES,
  DEFAULT_TAX_TYPE_CODE,
} from './constants';
export type { UblWithholdingTaxCode } from './constants';
export type {
  UblRounding,
  UblCalcLine,
  UblCalcInput,
  UblCalcOptions,
  UblCalcResult,
  UblCalcLineResult,
  UblCalcAllowanceCharge,
  UblCalcTaxSubtotal,
  UblCalcWithholdingSubtotal,
  UblDocumentAllowanceCharge,
  UblValidationIssue,
} from './types';
