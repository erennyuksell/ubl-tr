// shared/lib/ubl-tr/index.ts
// UBL-TR Builder — barrel exports
// 100% GİB UBL-TR v1.2.1 compliant

export { buildUblInvoice, buildUblInvoiceXml } from './builder';
export { InvoiceParser } from './parser';
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
  UblValidationIssue,
  UblValidationResult,
  UblXmlOptions,
} from './types';
export {
  TAX_CODE_NAMES,
  DEFAULT_TAX_TYPE_CODE,
  DEFAULT_TAX_TYPE_NAME,
  DEFAULT_UNIT_CODE,
  WITHHOLDING_TAX_TYPE_CODE,
} from './constants';
