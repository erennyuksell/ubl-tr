// shared/lib/ubl-tr/index.ts
// UBL-TR Builder — barrel exports
// 100% GİB UBL-TR v1.2.1 compliant

export { buildUblInvoice, buildUblInvoiceXml } from './builder';
export { calculateInvoice } from './calc';
export { allocateAmount, splitVatInclusive } from './allocate';
export type { UblVatInclusiveSplit } from './allocate';
export { InvoiceParser } from './parser';
export { UblParseError } from './errors';
export {
  isValidVkn,
  isValidTckn,
  isValidTaxId,
  FINAL_CONSUMER_TCKN,
  FOREIGN_BUYER_VKN,
} from './identity';
export { toUblXml } from './xml';
export {
  calculateInvoiceTotals,
  validateUblInvoiceInput,
  assertValidUblInvoiceInput,
  UblValidationError,
} from './validation';
export type { InvoiceExtractedData } from './parser';
export type {
  // Core
  UblInvoiceInput,
  UblInvoiceLine,
  UblAddress,
  UblParty,
  // Party details
  UblContact,
  UblPerson,
  UblLegalEntity,
  UblPartyIdentification,
  // Payment
  UblBillingReference,
  UblTaxRepresentative,
  UblFinancialAccount,
  UblPaymentMeans,
  // Delivery & Shipment (İhracat)
  UblDelivery,
  UblShipment,
  UblGoodsItem,
  UblTransportHandlingUnit,
  // e-Arşiv (GİB VUK 433)
  UblEArchiveInfo,
  UblInternetSalesInfo,
  UblEArchiveDeliveryType,
  // Output, validation, XML
  UblInvoiceDocument,
  UblElement,
  UblValue,
  UblAmount,
  UblTextWithAttributes,
  UblBuildOptions,
  UblBuildXmlOptions,
  UblCalculatedTotals,
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
  UblValidationOptions,
  UblValidationResult,
  UblXmlOptions,
} from './types';
export {
  TAX_CODE_NAMES,
  DEFAULT_TAX_TYPE_CODE,
  DEFAULT_TAX_TYPE_NAME,
  DEFAULT_UNIT_CODE,
  WITHHOLDING_TAX_TYPE_CODE,
  WITHHOLDING_TAX_CODES,
  WITHHOLDING_INVOICE_TYPE_CODES,
  RETURN_INVOICE_TYPE_CODES,
  PROFILE_INVOICE_TYPE_CODES,
  INVOICE_TYPE_PROFILE_IDS,
  BUYER_PARTY_TYPES,
} from './constants';
export {
  UNSUPPORTED_PROFILE_IDS,
  UNSUPPORTED_INVOICE_TYPE_CODES,
  SGK_INVOICE_GROUPS,
} from './gib-rules';
export * from './gib-codelists';
export type { UblWithholdingTaxCode } from './constants';
export { roundMoney, roundTo, toMinor, fromMinor, sumInMinor } from './money';
