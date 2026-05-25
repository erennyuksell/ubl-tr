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

// ─── Core Types ──────────────────────────────────────────

/**
 * Input for building a UBL-TR invoice line.
 * Maps directly to GİB UBL-TR InvoiceLine element.
 */
export interface UblInvoiceLine {
  name: string;
  description?: string;
  quantity: number;
  unitCode?: string; // GİB birim kodu (default: NIU = adet)
  price: number;
  discount?: number;
  discountReason?: string;
  lineAmount: number;
  vatRate: number;
  taxAmount: number;
  taxTypeCode?: string; // GİB vergi kodu (default: 0015 = KDV)
  withholdingTaxCode?: string;
  withholdingTaxRate?: number;
  withholdingTaxAmount?: number;
  withholdingTaxName?: string;
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
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
  // ─── Surcharge (AllowanceCharge isCharge=true) ───
  surchargeRate?: number;
  surchargeAmount?: number;
  surchargeReason?: string;
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

  // ── Amounts ──────────────────────────────────────
  taxExclusiveAmount: number;
  taxAmount: number;
  discount: number;
  payableAmount: number;

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
  billingReferenceInvoiceNo?: string;
  billingReferenceIssueDate?: string;
  additionalDocumentReferences?: Array<{
    id: string;
    issueDate?: string;
    documentType?: string;
    documentDescription?: string;
  }>;

  // ── Header-level allowance/charge ────────────────
  headerAllowanceCharges?: Array<{
    isCharge: boolean;
    percent?: number;
    amount: number;
    baseAmount?: number;
    reason?: string;
  }>;

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

export interface UblBuildOptions {
  validate?: boolean;
  tolerance?: number;
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
