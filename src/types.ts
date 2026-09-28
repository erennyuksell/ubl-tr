// shared/lib/ubl-tr/types.ts
// UBL-TR Invoice types — provider-agnostic, npm-extractable
// 100% GİB UBL-TR v1.2.1 compliant

// ─── e-Arşiv GİB Requirements (VUK 433. Tebliğ) ─────────

/** e-Arşiv delivery type — GİB standard, not provider-specific */
export type UblEArchiveDeliveryType = 'Electronic' | 'Paper';

/** Internet sales info — required by GİB for e-Arşiv internet satış faturaları */
export interface UblInternetSalesInfo {
  webAddress: string;
  paymentMediatorName: string; // Ödeme aracısı adı
  paymentType: string; // KREDIKARTI/BANKAKARTI, EFT/HAVALE, KAPIDAODEME, ODEMEARACISI, DIGER
  paymentDate: string; // ISO date
}

/** e-Arşiv fatura ek bilgileri — GİB yasal gereksinimleri */
export interface UblEArchiveInfo {
  deliveryType: UblEArchiveDeliveryType;
  internetSalesInfo?: UblInternetSalesInfo;
}

// ─── Calculation (calculateInvoice) ─────────────────────

/** How VAT is rounded: per line (GİB's examples, the default) or once per rate group. */
export type UblRounding = 'line' | 'document';

/**
 * One line as the calculator reads it: the business inputs. Amounts are computed from these;
 * nothing here is a result.
 */
export interface UblCalcLine {
  quantity: number;
  /** Unit price, VAT-exclusive. Not read when `vatInclusiveAmount` is given (pass 0 or the last result). */
  price: number;
  /**
   * The line's amount with VAT, after its discount and surcharge: a VAT-inclusive price, the
   * amount the customer is charged. The VAT is taken out of it, `round(amount × rate / (100 +
   * rate))`, the net is the rest (`splitVatInclusive`), and the unit price is derived from the net
   * (eight decimals). The line comes to this amount exactly. Its discount and surcharge are given
   * as amounts (VAT-exclusive, as on every line); rates, document allowances and
   * `rounding: 'document'` are not combined with it.
   */
  vatInclusiveAmount?: number;
  /** Line discount (iskonto) amount, VAT-exclusive. Wins over `discountRate` when both are given. */
  discount?: number;
  /** Line discount as a percent of quantity × price (5 = 5%). */
  discountRate?: number;
  /** Line surcharge (artırım) amount, VAT-exclusive. Wins over `surchargeRate` when both are given. */
  surchargeAmount?: number;
  /** Line surcharge as a percent of quantity × price (10 = 10%). */
  surchargeRate?: number;
  /** Percent (20 = 20%). */
  vatRate: number;
  /** GİB tax type code of the VAT (default 0015). Lines are grouped by rate and code. */
  taxTypeCode?: string;
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
  /** GİB tevkifat code; the rate comes from `WITHHOLDING_TAX_CODES`. */
  withholdingTaxCode?: string;
}

/**
 * A document-level allowance (iskonto) or charge (artırım). It is spread over the lines in
 * proportion to their net amounts (largest remainder, whole kuruş) and written on each line as an
 * AllowanceCharge of its own, so that every line's VAT is computed on what it really costs.
 */
export interface UblDocumentAllowanceCharge {
  isCharge: boolean;
  /** Percent of the lines' net total (5 = 5%). */
  percent?: number;
  /** Amount, VAT-exclusive. Wins over `percent` when both are given. */
  amount?: number;
  /** Optional check: must equal the lines' net total the percent is taken from. */
  baseAmount?: number;
  reason?: string;
}

/** Input of `calculateInvoice`. `UblInvoiceInput` satisfies it. */
export interface UblCalcInput {
  lines: readonly UblCalcLine[];
  headerAllowanceCharges?: readonly UblDocumentAllowanceCharge[];
  /**
   * LegalMonetaryTotal/PayableRoundingAmount: added to the payable amount, never to a line. For a
   * document whose total is fixed and whose lines cannot reach it, such as the exact reversal of
   * an invoice issued with another rounding. At most one kuruş per line either way. A sale at a
   * VAT-inclusive price needs none: give its lines `vatInclusiveAmount`.
   */
  payableRoundingAmount?: number;
}

export interface UblCalcOptions {
  /**
   * Default `'line'`: each line's VAT is `round(net × rate)`, as in GİB's examples, or taken out of
   * its `vatInclusiveAmount`.
   */
  rounding?: UblRounding;
}

/** One AllowanceCharge of a line, as written to the XML. */
export interface UblCalcAllowanceCharge {
  isCharge: boolean;
  reason?: string;
  amount: number;
  baseAmount: number;
  /** MultiplierFactorNumeric: a fraction (0.05 for 5%), as GİB writes it. */
  multiplierFactor?: number;
  /** Share of a document-level allowance or charge. */
  fromDocument: boolean;
}

export interface UblCalcLineResult {
  /** VAT-exclusive unit price, eight decimals (PriceAmount). */
  price: number;
  quantity: number;
  /** quantity × price, to the kuruş (the AllowanceCharge BaseAmount). */
  grossAmount: number;
  allowanceCharges: UblCalcAllowanceCharge[];
  /** All allowances of the line, document shares included. */
  discount: number;
  /** All charges of the line, document shares included. */
  surchargeAmount: number;
  /** LineExtensionAmount: gross − discount + surcharge. */
  lineAmount: number;
  vatRate: number;
  taxTypeCode: string;
  /** VAT before withholding. */
  taxAmount: number;
  withholdingTaxCode?: string;
  withholdingTaxRate: number;
  withholdingTaxAmount: number;
}

export interface UblCalcTaxSubtotal {
  vatRate: number;
  taxTypeCode: string;
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
  taxableAmount: number;
  taxAmount: number;
}

export interface UblCalcWithholdingSubtotal {
  code: string;
  rate: number;
  /** The VAT the withholding is taken from. */
  taxableAmount: number;
  taxAmount: number;
}

/** Output of `calculateInvoice`: every amount the UBL-TR document carries. */
export interface UblCalcResult {
  lines: UblCalcLineResult[];
  /** LegalMonetaryTotal/LineExtensionAmount: before discounts, surcharges included (GİB). */
  lineExtensionAmount: number;
  /** LegalMonetaryTotal/AllowanceTotalAmount: all discounts. */
  allowanceTotalAmount: number;
  /** All surcharges. Already inside lineExtensionAmount; GİB's viewer shows no ChargeTotal. */
  chargeTotalAmount: number;
  /** Σ line amounts. */
  taxExclusiveAmount: number;
  /** VAT before withholding (Σ taxSubtotals). */
  vatAmount: number;
  /** Net plus the full VAT. */
  taxInclusiveAmount: number;
  /** TaxTotal/TaxAmount: VAT after withholding, as in GİB's TEVKIFAT.xml. */
  taxTotalAmount: number;
  taxSubtotals: UblCalcTaxSubtotal[];
  withholdingTaxAmount: number;
  withholdingSubtotals: UblCalcWithholdingSubtotal[];
  /** PayableRoundingAmount, 0 when none was given. */
  payableRoundingAmount: number;
  /** TaxInclusiveAmount − withholding + payableRoundingAmount. */
  payableAmount: number;
}

// ─── Core Types ──────────────────────────────────────────

/**
 * Input for building a UBL-TR invoice line: the calculator's inputs (`UblCalcLine`) plus what the
 * document says about the item. The amounts are computed by `calculateInvoice`; the optional
 * amount fields below are checks, kept for callers that computed them: each must equal the
 * calculated value exactly, or building fails.
 */
export interface UblInvoiceLine extends UblCalcLine {
  name: string;
  description?: string;
  unitCode?: string; // GİB birim kodu (default: NIU = adet)
  discountReason?: string;
  surchargeReason?: string;
  withholdingTaxName?: string;
  /** Check: quantity × price − discount + surcharge, to the kuruş. */
  lineAmount?: number;
  /** Check: the line's VAT before withholding. */
  taxAmount?: number;
  /** Check: GİB's rate for `withholdingTaxCode`. */
  withholdingTaxRate?: number;
  /** Check: round(taxAmount × withholding rate). */
  withholdingTaxAmount?: number;
  // ─── Identification ───
  sellerCode?: string; // SellersItemIdentification.ID
  buyerCode?: string; // BuyersItemIdentification.ID
  manufacturerCode?: string; // ManufacturersItemIdentification.ID
  brandName?: string; // AdditionalItemProperty
  modelName?: string; // AdditionalItemProperty
  // ─── Classification ───
  originCountry?: string; // Item.OriginCountry.Name
  classificationCode?: string;
  classificationName?: string;
  classificationVersion?: string;
  // ─── References ───
  despatchDocNo?: string; // DespatchLineReference
  despatchDocDate?: string;
  orderNo?: string; // OrderLineReference
  orderDate?: string;
  delivery?: UblDelivery;
  // ─── Extra ───
  note?: string;
  additionalInfoId?: string;
}

/**
 * Contact information per UBL-TR Contact element.
 */
export interface UblContact {
  phone?: string;
  fax?: string;
  email?: string;
}

/**
 * Person identification per UBL-TR Person element.
 * Used for TCKN customers (real persons).
 */
export interface UblPerson {
  firstName: string;
  familyName: string;
}

/**
 * Legal entity per UBL-TR PartyLegalEntity element.
 * Trade registry info.
 */
export interface UblLegalEntity {
  registrationName?: string; // Resmi unvan
  companyId?: string; // Ticaret sicil no
  registrationSchemeName?: string; // "Ticaret Odası"
}

/**
 * Address structure per UBL-TR PostalAddress.
 * Full coverage of all PostalAddress fields used in GİB examples.
 */
export interface UblAddress {
  id?: string; // PostalAddress.ID (mernis kodu vb.)
  room?: string; // Daire no
  street?: string;
  blockName?: string; // Blok adı (A, B, C...)
  buildingName?: string; // Bina adı
  buildingNumber?: string;
  district?: string; // Mahalle
  city?: string;
  postalZone?: string;
  country?: string;
}

/**
 * Additional party identification per UBL-TR PartyIdentification.
 * Allows multiple IDs with different schemeID values.
 * GİB schemeID codes: VKN, TCKN, MERSISNO, TICARETSICILNO,
 * HIZMETNO, MUSTERINO, TESISATNO, TELEFONNO, ABONENO, SAYACNO,
 * EPDKNO, SUBENO, PASAPORTNO
 */
export interface UblPartyIdentification {
  schemeID: string;
  value: string;
}

/**
 * Party (supplier/customer) identification.
 * Full coverage of all Party fields used in GİB official examples.
 */
export interface UblParty {
  vkn: string; // VKN (10) or TCKN (11) — primary ID
  title: string;
  taxOffice?: string;
  address?: UblAddress;
  webSiteUri?: string;
  contact?: UblContact;
  person?: UblPerson; // TCKN kişiler için
  legalEntity?: UblLegalEntity;
  agentParty?: UblParty; // Temsilci / acente
  additionalIds?: UblPartyIdentification[]; // MERSISNO, TICARETSICILNO vb.
}

// ─── Financial Account ───────────────────────────────────

/**
 * Financial account for PaymentMeans.
 * Maps to UBL-TR PayeeFinancialAccount element.
 */
export interface UblFinancialAccount {
  iban: string; // IBAN or account number
  currencyCode?: string;
  paymentNote?: string; // "X Bankası Y Şubesi TL Hesabı"
  bankName?: string; // FinancialInstitution.Name
  branchName?: string; // FinancialInstitutionBranch.Name
}

/**
 * Payment means per UBL-TR PaymentMeans element.
 */
export interface UblPaymentMeans {
  code: string; // PaymentMeansCode (1=Nakit, 2=Çek, 3=Havale, vb.)
  dueDate?: Date;
  financialAccount?: UblFinancialAccount;
}

// ─── Delivery & Shipment (İhracat) ──────────────────────

/**
 * Goods item for export shipments.
 * Maps to UBL-TR GoodsItem element — GTİP details per item.
 */
export interface UblGoodsItem {
  description?: string;
  quantity?: number;
  unitCode?: string;
  statisticalValue?: number;
  requiredCustomsId?: string; // GTİP numarası (12 hane, noktasız)
}

/**
 * Transport handling unit for shipment packaging details.
 * Maps to UBL-TR TransportHandlingUnit element.
 */
export interface UblTransportHandlingUnit {
  transportHandlingUnitTypeCode?: string;
  actualPackageId?: string;
  actualPackageQuantity?: number;
  actualPackageType?: string; // Package type code (e.g., BX=Box, CT=Carton)
}

/**
 * Shipment details for export invoices.
 * Maps to UBL-TR Shipment element.
 */
export interface UblShipment {
  grossWeight?: number;
  netWeight?: number;
  weightUnit?: string; // default: KGM
  totalPackages?: number;
  insuranceValue?: number;
  declaredValue?: number;
  currency?: string;
  transportModeCode?: string;
  goodsItems?: UblGoodsItem[];
  transportHandlingUnits?: UblTransportHandlingUnit[];
}

/**
 * Delivery information.
 * Used for ISTISNA/IHRACAT invoices — nakliye, teslimat adresi, taşıyıcı bilgisi.
 */
export interface UblDelivery {
  actualDeliveryDate?: Date; // Fiili teslim tarihi
  address?: UblAddress;
  carrierParty?: {
    name: string;
    vkn?: string;
    address?: UblAddress;
  };
  deliveryTerms?: string; // CIF, FOB, CPT, etc.
  shipment?: UblShipment;
}

// ─── Main Invoice Input ──────────────────────────────────

/**
 * Input for building a UBL-TR Invoice JS object.
 * Provider-agnostic — works with any e-fatura provider (Uyumsoft, Foriba, Logo, etc.)
 * 100% GİB UBL-TR v1.2.1 compliant.
 */
export interface UblInvoiceInput {
  // ── Header ───────────────────────────────────────
  invoiceNo: string;
  uuid?: string; // ETTN — optional, provider may generate
  issueDate: Date;
  issueTime?: string;
  invoiceTypeCode: string; // SATIS, IADE, ISTISNA, TEVKIFAT, etc.
  profileId: string; // TICARIFATURA, TEMELFATURA, EARSIVFATURA, etc.
  currency?: string; // default: TRY
  notes?: string[]; // Note[] — birden fazla not

  // ── Multi-currency ───────────────────────────────
  taxCurrencyCode?: string;
  pricingCurrencyCode?: string;
  paymentCurrencyCode?: string;
  exchangeRate?: number;

  // ── Amounts (checks) ─────────────────────────────
  // Computed by `calculateInvoice`. When given, each must equal the calculated value exactly.
  taxExclusiveAmount?: number;
  /** VAT after withholding (TaxTotal/TaxAmount). */
  taxAmount?: number;
  /** All discounts (AllowanceTotalAmount). */
  discount?: number;
  payableAmount?: number;
  /** Input, not a check: see `UblCalcInput.payableRoundingAmount`. */
  payableRoundingAmount?: number;

  // ── Lines ────────────────────────────────────────
  lines: UblInvoiceLine[];

  // ── Parties ──────────────────────────────────────
  supplier: UblParty;
  customer: UblParty;
  buyerCustomer?: UblParty;

  // ── Optional fields ──────────────────────────────
  description?: string; // Eski uyumluluk — notes[] ile birleşir
  dueDate?: Date;
  invoicePeriodStart?: Date;
  invoicePeriodEnd?: Date;

  // ── Payment ──────────────────────────────────────
  paymentMeansCode?: string; // Eski uyumluluk
  paymentMeans?: UblPaymentMeans; // Tam PaymentMeans nesnesi

  // ── Delivery (İhracat) ───────────────────────────
  delivery?: UblDelivery;

  // ── References ───────────────────────────────────
  orderReference?: { id: string; issueDate?: string };
  despatchDocumentNo?: string;
  receiptDocumentNo?: string; // Alım irsaliyesi referansı
  receiptDocumentDate?: string;
  contractDocumentNo?: string; // Sözleşme referansı
  contractDocumentDate?: string;
  billingReferenceInvoiceNo?: string; // Returned invoice's 16-character GİB number; required on returns
  billingReferenceIssueDate?: string;
  additionalDocumentReferences?: Array<{
    id: string;
    issueDate?: string;
    documentType?: string;
    documentDescription?: string;
  }>;

  // ── Document-level allowance/charge ──────────────
  /** Spread over the lines by `calculateInvoice`; see `UblDocumentAllowanceCharge`. */
  headerAllowanceCharges?: UblDocumentAllowanceCharge[];

  // ── e-Arşiv (GİB legal requirements — VUK 433) ──
  eArchiveInfo?: UblEArchiveInfo;
}

// ─── Build Output & Validation ──────────────────────────

export type UblPrimitive = string | number | boolean | null;
export type UblValue = UblPrimitive | UblElement | UblValue[];

export interface UblAmount {
  $value: number;
  $attributes: {
    currencyID: string;
  };
}

export interface UblTextWithAttributes {
  $value: string | number | boolean;
  $attributes: Record<string, string>;
}

export interface UblElement {
  [key: string]: UblValue | Record<string, string> | undefined;
}

export interface UblInvoiceDocument extends UblElement {
  UBLExtensions: UblElement;
  UBLVersionID: '2.1';
  CustomizationID: 'TR1.2';
  ProfileID: string;
  ID: string;
  CopyIndicator: boolean;
  UUID?: string;
  IssueDate: string;
  IssueTime: string;
  InvoiceTypeCode: string;
  DocumentCurrencyCode: string;
  LineCountNumeric: number;
  Signature: UblElement[];
  AccountingSupplierParty: UblElement;
  AccountingCustomerParty: UblElement;
  TaxTotal: UblElement;
  LegalMonetaryTotal: UblElement;
  InvoiceLine: UblElement[];
}

export interface UblValidationOptions extends UblCalcOptions {
  /**
   * The invoice number (cbc:ID) is assigned by the e-document provider rather than the caller.
   *
   * Turkish e-invoice providers (Uyumsoft among them) allocate the number from a registered
   * series when the submitted ID is blank, or from a specific series when a 3-character prefix
   * is submitted. With this flag set, a blank `invoiceNo` is accepted and passes through to
   * `cbc:ID` untouched. Leave it off when building a standalone UBL-TR document, where GİB
   * requires a fully-formed 16-character number.
   */
  providerAssignedInvoiceNo?: boolean;
}

export interface UblBuildOptions extends UblValidationOptions {
  validate?: boolean;
}

export interface UblValidationIssue {
  path: string;
  message: string;
}

export interface UblValidationResult {
  valid: boolean;
  issues: UblValidationIssue[];
}

export interface UblCalculatedTotals {
  taxExclusiveAmount: number;
  taxAmount: number;
  discount: number;
  payableAmount: number;
}

export interface UblXmlOptions {
  pretty?: boolean;
  declaration?: boolean;
  rootName?: string;
  namespaces?: Record<string, string>;
}

export type UblBuildXmlOptions = UblBuildOptions & UblXmlOptions;
