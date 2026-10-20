// Input rules taken from GİB's e-Fatura schematron (UBL-TR_Common_Schematron.xml, package of 2026-08-21).
// Each check names the schematron rule it mirrors. Only rules about what the caller supplies live here; what
// the builder always writes the same way (version, customization, copy indicator, signature block, amount
// format) is left to the schematron test (test/schematron.test.ts). docs/gib-schematron-coverage.md lists
// every rule of the file and where it is checked.

import {
  BUYER_PARTY_TYPES,
  INVOICE_TYPE_PROFILE_IDS,
  PROFILE_INVOICE_TYPE_CODES,
} from './constants';
import {
  COUNTRY_CODES,
  CURRENCY_CODES,
  DOCUMENT_DESCRIPTIONS,
  EARCHIVE_INVESTMENT_TYPE_CODES,
  INVESTMENT_EXEMPTION_CODES,
  INVESTMENT_EXPENSE_TYPES,
  DELIVERY_TERM_CODES,
  EXEMPTION_CODES_FOR_IHRACKAYITLI,
  EXEMPTION_CODES_FOR_ISTISNA,
  EXEMPTION_CODES_FOR_OZELMATRAH,
  GIB_EARCHIVE_PROFILE_IDS,
  GIB_EFATURA_PROFILE_IDS,
  GIB_INVOICE_TYPE_CODES,
  PACKAGE_TYPE_CODES,
  PARTY_IDENTIFICATION_SCHEMES,
  PAYMENT_MEANS_CODES,
  TAX_EXEMPTION_REASON_CODES,
  TAX_TYPE_CODES,
  TRANSPORT_MODE_CODES,
} from './gib-codelists';
import { addIssue, checkAddress, checkTaxId, isBlank } from './validation-helpers';
import { RETURN_INVOICE_TYPE_CODES } from './constants';
import type {
  UblCalcResult,
  UblInvoiceLine,
  UblDelivery,
  UblInvoiceInput,
  UblParty,
  UblValidationIssue,
  UblValidationOptions,
} from './types';

/**
 * Investment incentive exemptions (YATIRIMTESVIK with ISTISNA, e-Arşiv YTBISTISNA): GİB asks for the VAT on
 * the line with CalculationSequenceNumeric -1 and exemption 308 or 339, a VAT that is shown and not charged.
 * How it enters the totals is in GİB's investment incentive guide, which ubl-tr has not been checked
 * against yet, so validation refuses these two pairs rather than build totals GİB may refuse.
 */
export const UNSUPPORTED_PROFILE_IDS: readonly string[] = [];
export const UNSUPPORTED_INVOICE_TYPE_CODES: readonly string[] = ['YTBISTISNA'];

/** GİB's VKN for the customs authority, the customer of an export or a tax-free sale. */
const CUSTOMS_AUTHORITY_VKN = '1460415308';

/** InvoiceIDCheck: three letters or digits, the year from 2000, a nine-digit sequence. */
const GIB_INVOICE_NO = /^[A-Z0-9]{3}20[0-9]{2}[0-9]{9}$/;
/** UUIDCheck. */
const UUID = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;
/** KamuFaturaCheck: a Turkish IBAN written without spaces. */
const TURKISH_IBAN = /^TR\d{7}[A-Z0-9]{17}$/;

/** Types a zero VAT (0015) may have without an exemption reason (TaxExemptionReasonCheck). */
const ZERO_VAT_WITHOUT_REASON_TYPES = [
  'IADE',
  'YTBIADE',
  'IHRACKAYITLI',
  'OZELMATRAH',
  'SGK',
  'KONAKLAMAVERGISI',
];
/** Profiles the 555 (demirbaş KDV) exemption is allowed under (DemirbasKDVTaxExemptionCheck). */
const DEMIRBAS_PROFILE_IDS = ['TEMELFATURA', 'TICARIFATURA', 'EARSIVFATURA'];

const listOf = (codes: readonly string[]) =>
  codes.length > 12 ? 'see the code list' : codes.join(', ');

function checkCode(
  value: string | undefined,
  codes: readonly string[],
  path: string,
  what: string,
  listName: string,
  issues: UblValidationIssue[],
): void {
  if (value != null && value !== '' && !codes.includes(value)) {
    addIssue(issues, path, `${value} is not a GİB ${what} (${listName}: ${listOf(codes)}).`);
  }
}

/** ProfileIDCheck, InvoiceTypeCodeCheck and the per-profile type checks, plus what ubl-tr cannot build. */
function checkProfileAndType(input: UblInvoiceInput, issues: UblValidationIssue[]): void {
  const { profileId, invoiceTypeCode } = input;
  if (isBlank(profileId) || isBlank(invoiceTypeCode)) return;
  checkCode(
    profileId,
    [...GIB_EFATURA_PROFILE_IDS, ...GIB_EARCHIVE_PROFILE_IDS],
    'profileId',
    'profile',
    'GIB_EFATURA_PROFILE_IDS, GIB_EARCHIVE_PROFILE_IDS',
    issues,
  );
  checkCode(
    invoiceTypeCode,
    GIB_INVOICE_TYPE_CODES,
    'invoiceTypeCode',
    'invoice type',
    'GIB_INVOICE_TYPE_CODES',
    issues,
  );
  if (
    UNSUPPORTED_INVOICE_TYPE_CODES.includes(invoiceTypeCode) ||
    (profileId === 'YATIRIMTESVIK' && invoiceTypeCode === 'ISTISNA')
  ) {
    addIssue(
      issues,
      'invoiceTypeCode',
      `An investment incentive exemption (${profileId} ${invoiceTypeCode}) is not supported yet; see UNSUPPORTED_INVOICE_TYPE_CODES.`,
    );
    return;
  }
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

/** InvoiceIDCheck, UUIDCheck, CurrencyCodeCheck. */
function checkHeader(
  input: UblInvoiceInput,
  options: UblValidationOptions,
  issues: UblValidationIssue[],
): void {
  const invoiceNo = input.invoiceNo?.trim() ?? '';
  // A blank number is reported by the general check. A provider that assigns the number takes it blank
  // or as the 3-character series to allocate from.
  const providerSeries = options.providerAssignedInvoiceNo && /^[A-Z0-9]{3}$/.test(invoiceNo);
  if (invoiceNo && !providerSeries && !GIB_INVOICE_NO.test(invoiceNo)) {
    addIssue(
      issues,
      'invoiceNo',
      'A GİB invoice number is a 3-character series, the year and 9 digits (ABC2026000000001).',
    );
  }
  if (input.uuid && !UUID.test(input.uuid))
    addIssue(issues, 'uuid', 'The UUID (ETTN) must be in UUID format.');

  const currency = input.currency ?? 'TRY';
  checkCode(currency, CURRENCY_CODES, 'currency', 'currency code', 'CURRENCY_CODES', issues);
  checkCode(
    input.taxCurrencyCode,
    CURRENCY_CODES,
    'taxCurrencyCode',
    'currency code',
    'CURRENCY_CODES',
    issues,
  );
  checkCode(
    input.pricingCurrencyCode,
    CURRENCY_CODES,
    'pricingCurrencyCode',
    'currency code',
    'CURRENCY_CODES',
    issues,
  );
  checkCode(
    input.paymentCurrencyCode,
    CURRENCY_CODES,
    'paymentCurrencyCode',
    'currency code',
    'CURRENCY_CODES',
    issues,
  );
  if (currency !== 'TRY') {
    const rate = input.exchangeRate;
    if (rate == null || !Number.isFinite(rate) || rate <= 0) {
      addIssue(issues, 'exchangeRate', `An invoice in ${currency} needs the exchange rate to TRY.`);
    } else if (!/^\d{1,17}(\.\d{1,6})?$/.test(String(rate))) {
      addIssue(issues, 'exchangeRate', 'The exchange rate has at most 6 decimals.');
    }
  }
}

/** PartyIdentificationSchemeIDCheck and PartyIdentificationPartyNamePersonCheck (a TCKN party is a person). */
function checkPartyRules(party: UblParty, path: string, issues: UblValidationIssue[]): void {
  party.additionalIds?.forEach((id, index) =>
    checkCode(
      id.schemeID,
      PARTY_IDENTIFICATION_SCHEMES,
      `${path}.additionalIds[${index}].schemeID`,
      'identification scheme',
      'PARTY_IDENTIFICATION_SCHEMES',
      issues,
    ),
  );
  if (party.vkn?.trim().length === 11) {
    if (!party.person || isBlank(party.person.firstName) || isBlank(party.person.familyName)) {
      addIssue(
        issues,
        `${path}.person`,
        'A TCKN party needs person.firstName and person.familyName.',
      );
    }
  }
}

/**
 * The buyer of an export or a tax-free sale (IhracatYolcuBeraberCheck, OfficelTitleCheck,
 * TaxFreeNationalityIDCheck, PassportIDCheck, TaxRepresentativePartyCheck) and the customs authority as
 * customer (TaxFreeInvoiceCheck). A foreign buyer has no VKN or tax office.
 */
function checkBuyer(input: UblInvoiceInput, issues: UblValidationIssue[]): void {
  const { buyerCustomer: buyer, profileId } = input;
  const partyType = BUYER_PARTY_TYPES[profileId];
  if (
    input.customer?.vkn?.trim() === CUSTOMS_AUTHORITY_VKN &&
    !['YOLCUBERABERFATURA', 'IHRACAT', 'OZELFATURA', 'KAMU'].includes(profileId)
  ) {
    addIssue(
      issues,
      'profileId',
      `An invoice to the customs authority (${CUSTOMS_AUTHORITY_VKN}) is YOLCUBERABERFATURA or IHRACAT.`,
    );
  }
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
      if (isBlank(representative.alias)) {
        addIssue(issues, 'taxRepresentative.alias', "The intermediary's GİB alias is required.");
      }
      checkAddress(representative.address, 'taxRepresentative.address', issues);
    }
  }
}

/**
 * Tax types and exemptions: TaxTypeCheck, GeneralWithholdingTaxTotalCheck (4171),
 * TaxExemptionReasonCodeCheck, TaxExemptionReasonCheck (a zero VAT needs a reason) and
 * DemirbasKDVTaxExemptionCheck (555).
 */
function checkTaxes(
  input: UblInvoiceInput,
  calc: UblCalcResult,
  issues: UblValidationIssue[],
): void {
  const { invoiceTypeCode: type, profileId } = input;
  input.lines.forEach((line, index) => {
    const path = `lines[${index}]`;
    const taxTypeCode = calc.lines[index]?.taxTypeCode ?? line.taxTypeCode;
    checkCode(
      taxTypeCode,
      TAX_TYPE_CODES,
      `${path}.taxTypeCode`,
      'tax type',
      'TAX_TYPE_CODES',
      issues,
    );
    if (taxTypeCode === '4171' && !['TEVKIFAT', 'IADE', 'SGK', 'YTBIADE'].includes(type)) {
      addIssue(
        issues,
        'invoiceTypeCode',
        'Tax type 4171 is used only on TEVKIFAT, IADE, YTBIADE and SGK invoices.',
      );
    }

    const code = line.taxExemptionReasonCode?.trim();
    if (!code) return;
    if (isBlank(line.taxExemptionReason)) {
      addIssue(issues, `${path}.taxExemptionReason`, 'An exemption code needs its reason text.');
    }
    if (!(isInvestmentIncentive(input) && INVESTMENT_EXEMPTION_CODES.includes(code))) {
      checkCode(
        code,
        TAX_EXEMPTION_REASON_CODES,
        `${path}.taxExemptionReasonCode`,
        'exemption code',
        'TAX_EXEMPTION_REASON_CODES',
        issues,
      );
    }
    const allowedTypes =
      code !== '555' && EXEMPTION_CODES_FOR_ISTISNA.includes(code)
        ? ['ISTISNA', 'IADE', 'IHRACKAYITLI', 'SGK', 'YTBISTISNA', 'YTBIADE']
        : EXEMPTION_CODES_FOR_OZELMATRAH.includes(code)
          ? ['OZELMATRAH', 'IADE', 'SGK']
          : EXEMPTION_CODES_FOR_IHRACKAYITLI.includes(code)
            ? ['IHRACKAYITLI', 'IADE', 'SGK']
            : undefined;
    if (allowedTypes && !allowedTypes.includes(type)) {
      addIssue(
        issues,
        `${path}.taxExemptionReasonCode`,
        `Exemption ${code} is used only on ${allowedTypes.join(', ')} invoices, not ${type}.`,
      );
    }
    if (code === '555') {
      if (
        !DEMIRBAS_PROFILE_IDS.includes(profileId) ||
        type === 'ISTISNA' ||
        type === 'IHRACKAYITLI' ||
        (profileId === 'EARSIVFATURA' && type.startsWith('YTB'))
      ) {
        addIssue(
          issues,
          `${path}.taxExemptionReasonCode`,
          `Exemption 555 is not allowed on a ${profileId} ${type} invoice.`,
        );
      }
      if ((calc.lines[index]?.vatRate ?? line.vatRate) === 0) {
        addIssue(
          issues,
          `${path}.vatRate`,
          'Exemption 555 (demirbaş KDV) keeps a VAT rate above zero.',
        );
      }
    }
  });

  if (!ZERO_VAT_WITHOUT_REASON_TYPES.includes(type)) {
    for (const group of calc.taxSubtotals) {
      if (
        group.taxAmount !== 0 ||
        group.taxTypeCode !== '0015' ||
        !isBlank(group.taxExemptionReason)
      )
        continue;
      calc.lines.forEach((line, index) => {
        if (
          line.vatRate === group.vatRate &&
          line.taxTypeCode === group.taxTypeCode &&
          !input.lines[index]?.taxExemptionReasonCode
        ) {
          addIssue(
            issues,
            `lines[${index}].taxExemptionReason`,
            'A zero VAT needs an exemption code and reason.',
          );
        }
      });
    }
  }
}

/** PaymentMeansCodeCheck and KamuFaturaCheck (a KAMU invoice is paid to a Turkish IBAN). */
function checkPayment(input: UblInvoiceInput, issues: UblValidationIssue[]): void {
  checkCode(
    input.paymentMeans?.code,
    PAYMENT_MEANS_CODES,
    'paymentMeans.code',
    'payment means code',
    'PAYMENT_MEANS_CODES',
    issues,
  );
  checkCode(
    input.paymentMeansCode,
    PAYMENT_MEANS_CODES,
    'paymentMeansCode',
    'payment means code',
    'PAYMENT_MEANS_CODES',
    issues,
  );
  if (
    input.profileId === 'KAMU' &&
    !TURKISH_IBAN.test(input.paymentMeans?.financialAccount?.iban ?? '')
  ) {
    addIssue(
      issues,
      'paymentMeans.financialAccount.iban',
      'A KAMU invoice needs the Turkish IBAN it is paid to, without spaces.',
    );
  }
}

function checkDeliveryCodes(
  delivery: UblDelivery | undefined,
  path: string,
  issues: UblValidationIssue[],
): void {
  if (!delivery) return;
  checkCode(
    delivery.deliveryTerms,
    DELIVERY_TERM_CODES,
    `${path}.deliveryTerms`,
    'delivery term',
    'DELIVERY_TERM_CODES',
    issues,
  );
  checkCode(
    delivery.shipment?.transportModeCode,
    TRANSPORT_MODE_CODES,
    `${path}.shipment.transportModeCode`,
    'transport mode',
    'TRANSPORT_MODE_CODES',
    issues,
  );
  delivery.shipment?.transportHandlingUnits?.forEach((unit, index) =>
    checkCode(
      unit.actualPackageType,
      PACKAGE_TYPE_CODES,
      `${path}.shipment.transportHandlingUnits[${index}].actualPackageType`,
      'package type',
      'PACKAGE_TYPE_CODES',
      issues,
    ),
  );
}

/** DeliveryCodeCheck and, on an export, LineDeliveryCheck: terms, address, transport mode and GTİP per line. */
function checkDelivery(input: UblInvoiceInput, issues: UblValidationIssue[]): void {
  checkDeliveryCodes(input.delivery, 'delivery', issues);
  input.lines.forEach((line, index) =>
    checkDeliveryCodes(line.delivery, `lines[${index}].delivery`, issues),
  );
  if (input.profileId !== 'IHRACAT') return;
  const document = input.delivery;
  input.lines.forEach((line, index) => {
    const path = `lines[${index}].delivery`;
    const own = line.delivery;
    if (isBlank(own?.deliveryTerms) && isBlank(document?.deliveryTerms)) {
      addIssue(
        issues,
        `${path}.deliveryTerms`,
        'An export needs the delivery terms (INCOTERMS) on the line or the invoice.',
      );
    }
    if (!own?.address && !document?.address) {
      addIssue(
        issues,
        `${path}.address`,
        'An export needs the delivery address on the line or the invoice.',
      );
    }
    if (
      isBlank(own?.shipment?.transportModeCode) &&
      isBlank(document?.shipment?.transportModeCode)
    ) {
      addIssue(
        issues,
        `${path}.shipment.transportModeCode`,
        'An export needs the transport mode on the line or the invoice.',
      );
    }
    if (isBlank(own?.shipment?.goodsItems?.[0]?.requiredCustomsId)) {
      addIssue(
        issues,
        `${path}.shipment.goodsItems[0].requiredCustomsId`,
        'An export line needs its GTİP number.',
      );
    }
  });
}

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM_SS = /^\d{2}:\d{2}:\d{2}$/;

/** A YATIRIMTESVIK invoice, or an e-Arşiv invoice of a YTB* type. */
function isInvestmentIncentive(input: UblInvoiceInput): boolean {
  return (
    input.profileId === 'YATIRIMTESVIK' ||
    (input.profileId === 'EARSIVFATURA' &&
      EARCHIVE_INVESTMENT_TYPE_CODES.includes(input.invoiceTypeCode))
  );
}

/** The line's item identifications with this schemeID and a non-blank value. */
function itemIds(line: UblInvoiceLine, ...schemes: string[]): string[] {
  return (line.additionalItemIds ?? [])
    .filter((id) => schemes.includes(id.schemeID) && !isBlank(id.value))
    .map((id) => id.value.trim());
}

/** A party GİB's schema writes in full (cac:PartyIdentification and cac:PostalAddress are required). */
function checkSchemaParty(party: UblParty, path: string, issues: UblValidationIssue[]): void {
  if (isBlank(party.vkn) && !party.additionalIds?.length) {
    addIssue(issues, `${path}.vkn`, 'The party needs a VKN/TCKN or another identification.');
  }
  checkAddress(party.address, `${path}.address`, issues);
}

/**
 * Document references: GİB's schema requires the date of every reference; an investment incentive
 * is the only contract reference (YatirimTesvikContractDocumentReferenceIDCheck); an ÖKC receipt carries
 * its date, description, address and register (BillingReferenceCheck).
 */
function checkReferences(input: UblInvoiceInput, issues: UblValidationIssue[]): void {
  input.additionalDocumentReferences?.forEach((ref, index) => {
    if (!YYYY_MM_DD.test(ref.issueDate ?? '')) {
      addIssue(
        issues,
        `additionalDocumentReferences[${index}].issueDate`,
        'A document reference needs its date (YYYY-MM-DD).',
      );
    }
  });
  if (input.contractDocumentNo && !input.contractDocumentDate) {
    addIssue(issues, 'contractDocumentDate', 'A contract reference needs its date.');
  }
  if (input.receiptDocumentNo && !input.receiptDocumentDate) {
    addIssue(issues, 'receiptDocumentDate', 'A receipt reference needs its date.');
  }
  if (isInvestmentIncentive(input)) {
    const incentive = input.investmentIncentive;
    if (!incentive || !/^\d{6}$/.test(incentive.no) || !YYYY_MM_DD.test(incentive.issueDate)) {
      addIssue(
        issues,
        'investmentIncentive',
        'An investment incentive invoice needs the six-digit certificate number (YTBNO) and its date.',
      );
    }
    if (input.contractDocumentNo) {
      addIssue(
        issues,
        'contractDocumentNo',
        'An investment incentive invoice has the certificate as its only contract reference.',
      );
    }
  }
  input.okcReceipts?.forEach((receipt, index) => {
    const path = `okcReceipts[${index}]`;
    if (isBlank(receipt.id)) addIssue(issues, `${path}.id`, 'An ÖKC receipt needs its number.');
    if (!YYYY_MM_DD.test(receipt.issueDate))
      addIssue(issues, `${path}.issueDate`, 'An ÖKC receipt needs its date (YYYY-MM-DD).');
    checkCode(
      receipt.description,
      DOCUMENT_DESCRIPTIONS,
      `${path}.description`,
      'ÖKC receipt description',
      'DOCUMENT_DESCRIPTIONS',
      issues,
    );
    if (isBlank(receipt.description))
      addIssue(issues, `${path}.description`, 'An ÖKC receipt needs its description.');
    if (isBlank(receipt.uri))
      addIssue(issues, `${path}.uri`, "An ÖKC receipt needs the receipt's address (URI).");
    if (isBlank(receipt.issuer?.endpointId))
      addIssue(
        issues,
        `${path}.issuer.endpointId`,
        'An ÖKC receipt needs the register number (endpointId).',
      );
    if (receipt.issuer) checkSchemaParty(receipt.issuer, `${path}.issuer`, issues);
  });
}

/**
 * What each profile and type adds: HKS künye numbers (HKSInvioceCheck), ILAC_TIBBICIHAZ item codes,
 * TEKNOLOJIDESTEK (a person as customer, a TELEFON or TABLET_PC identification on every line), IDIS
 * shipment and label numbers, SARJ and SARJANLIK (plate, charging period, ESU report, charger serial),
 * investment incentives (expense type, machine data, VAT) and IHRACKAYITLI with exemption 702 (GTİP and the
 * buyer's customs line code).
 */
function checkProfileFields(
  input: UblInvoiceInput,
  calc: UblCalcResult,
  issues: UblValidationIssue[],
): void {
  const { profileId, invoiceTypeCode: type } = input;
  input.lines.forEach((line, index) => {
    const path = `lines[${index}]`;
    line.additionalItemIds?.forEach((id, idIndex) => {
      if (isBlank(id.schemeID) || isBlank(id.value)) {
        addIssue(
          issues,
          `${path}.additionalItemIds[${idIndex}]`,
          'An item identification needs its schemeID and value.',
        );
      }
    });
    if (profileId === 'HKS' && !itemIds(line, 'KUNYENO').some((id) => id.length === 19)) {
      addIssue(
        issues,
        `${path}.additionalItemIds`,
        'An HKS line needs its 19-character künye number (KUNYENO).',
      );
    }
    if (profileId === 'ILAC_TIBBICIHAZ' && !itemIds(line, 'ILAC', 'TIBBICIHAZ', 'DIGER').length) {
      addIssue(
        issues,
        `${path}.additionalItemIds`,
        'An ILAC_TIBBICIHAZ line needs an ILAC, TIBBICIHAZ or DIGER item code.',
      );
    }
    if (type === 'TEKNOLOJIDESTEK' && !itemIds(line, 'TELEFON', 'TABLET_PC').length) {
      addIssue(
        issues,
        `${path}.additionalItemIds`,
        'A TEKNOLOJIDESTEK line needs a TELEFON or TABLET_PC identification.',
      );
    }
    if (
      profileId === 'IDIS' &&
      !itemIds(line, 'ETIKETNO').some((id) => /^[A-Za-z]{2}\d{7}$/.test(id))
    ) {
      addIssue(
        issues,
        `${path}.additionalItemIds`,
        'An IDIS line needs its label number (ETIKETNO: two letters, seven digits).',
      );
    }
    if (type === 'SARJANLIK' && isBlank(line.itemInstance?.serialId)) {
      addIssue(
        issues,
        `${path}.itemInstance.serialId`,
        'A SARJANLIK line needs the charger serial.',
      );
    }

    if (isInvestmentIncentive(input)) {
      const expense = line.classificationCode ?? '';
      if (!INVESTMENT_EXPENSE_TYPES.includes(expense)) {
        addIssue(
          issues,
          `${path}.classificationCode`,
          `An investment incentive line needs its expense type (${INVESTMENT_EXPENSE_TYPES.join(', ')}).`,
        );
      }
      if (
        expense === '01' &&
        (isBlank(line.modelName) ||
          isBlank(line.itemInstance?.productTraceId) ||
          isBlank(line.itemInstance?.serialId))
      ) {
        addIssue(
          issues,
          `${path}.itemInstance`,
          'Expense type 01 needs the machine name (modelName), its sequence number (productTraceId) and ID (serialId).',
        );
      }
      const taxed =
        (calc.lines[index]?.taxAmount ?? 0) > 0 && (calc.lines[index]?.vatRate ?? 0) > 0;
      if (RETURN_INVOICE_TYPE_CODES.includes(type)) {
        if ((expense === '03' || expense === '04') && !((calc.lines[index]?.taxAmount ?? 0) > 0)) {
          addIssue(
            issues,
            `${path}.vatRate`,
            'An investment incentive return of expense type 03 or 04 carries its VAT.',
          );
        }
      } else if (!taxed) {
        addIssue(
          issues,
          `${path}.vatRate`,
          'An investment incentive line carries its VAT rate and amount.',
        );
      }
    }

    if (type === 'IHRACKAYITLI' && line.taxExemptionReasonCode?.trim() === '702') {
      const shipment = line.delivery?.shipment;
      const gtip = shipment?.goodsItems?.[0]?.requiredCustomsId?.trim() ?? '';
      const buyerLineCodes = (shipment?.transportHandlingUnits ?? []).flatMap((unit) =>
        (unit.customsDeclarations ?? []).flatMap((declaration) =>
          (declaration.issuer?.additionalIds ?? []).filter(
            (id) => id.schemeID === 'ALICIDIBSATIRKOD',
          ),
        ),
      );
      if (gtip.length !== 12) {
        addIssue(
          issues,
          `${path}.delivery.shipment.goodsItems[0].requiredCustomsId`,
          'Exemption 702 needs the 12-digit GTİP on the line.',
        );
      }
      if (!buyerLineCodes.some((id) => id.value.trim().length === 11)) {
        addIssue(
          issues,
          `${path}.delivery.shipment.transportHandlingUnits`,
          "Exemption 702 needs the buyer's 11-character customs line code (a customs declaration issuer with ALICIDIBSATIRKOD).",
        );
      }
    }
    (line.delivery?.shipment?.transportHandlingUnits ?? []).forEach((unit, unitIndex) =>
      (unit.customsDeclarations ?? []).forEach((declaration, declarationIndex) => {
        const declarationPath = `${path}.delivery.shipment.transportHandlingUnits[${unitIndex}].customsDeclarations[${declarationIndex}]`;
        if (isBlank(declaration.id))
          addIssue(issues, `${declarationPath}.id`, 'A customs declaration needs its ID.');
        if (!declaration.issuer) return;
        checkSchemaParty(declaration.issuer, `${declarationPath}.issuer`, issues);
        declaration.issuer.additionalIds?.forEach((id, idIndex) =>
          checkCode(
            id.schemeID,
            ['SATICIDIBSATIRKOD', 'ALICIDIBSATIRKOD'],
            `${declarationPath}.issuer.additionalIds[${idIndex}].schemeID`,
            'customs line code scheme',
            'IhracKayitliPartyIdentificationIDType',
            issues,
          ),
        );
      }),
    );
  });

  if (type === 'TEKNOLOJIDESTEK' && input.customer?.vkn?.trim().length !== 11) {
    addIssue(
      issues,
      'customer.vkn',
      "A TEKNOLOJIDESTEK invoice's customer is a person with a TCKN.",
    );
  }
  if (
    profileId === 'IDIS' &&
    !(input.supplier?.additionalIds ?? []).some(
      (id) => id.schemeID === 'SEVKIYATNO' && /^(SE|ES)-\d{7}$/.test(id.value),
    )
  ) {
    addIssue(
      issues,
      'supplier.additionalIds',
      'An IDIS invoice needs the shipment number (SEVKIYATNO: SE-0000000 or ES-0000000).',
    );
  }
  if (type === 'SARJ' || type === 'SARJANLIK') {
    const plates = (input.customer?.additionalIds ?? []).filter((id) => id.schemeID === 'PLAKA');
    if (plates.length !== 1 || !/^[A-Z0-9_-]{1,50}$/.test(plates[0]?.value.trim() ?? '')) {
      addIssue(
        issues,
        'customer.additionalIds',
        'A charging invoice names one vehicle plate (PLAKA: capital letters and digits).',
      );
    }
    const from2005 = (date?: Date) =>
      date instanceof Date && date.getTime() >= Date.UTC(2004, 11, 31, 20);
    if (!from2005(input.invoicePeriodStart) || !from2005(input.invoicePeriodEnd)) {
      addIssue(
        issues,
        'invoicePeriodStart',
        'A charging invoice needs the charging period (start and end date).',
      );
    }
    if (
      !HH_MM_SS.test(input.invoicePeriodStartTime ?? '') ||
      !HH_MM_SS.test(input.invoicePeriodEndTime ?? '')
    ) {
      addIssue(
        issues,
        'invoicePeriodStartTime',
        'A charging invoice needs the start and end time of the period (HH:mm:ss).',
      );
    }
  }
  if (
    type === 'SARJ' &&
    !(input.additionalDocumentReferences ?? []).some(
      (ref) =>
        ref.schemeId === 'ESURaporID' &&
        UUID.test(ref.id.trim()) &&
        /^20\d{2}-\d{2}-\d{2}$/.test(ref.issueDate ?? ''),
    )
  ) {
    addIssue(
      issues,
      'additionalDocumentReferences',
      'A SARJ invoice references its ESU report (schemeId ESURaporID, a UUID, and its date).',
    );
  }
}

/** Every input rule of GİB's schematron that ubl-tr checks before building. */
export function checkGibRules(
  input: UblInvoiceInput,
  calc: UblCalcResult,
  options: UblValidationOptions,
  issues: UblValidationIssue[],
): void {
  checkProfileAndType(input, issues);
  checkHeader(input, options, issues);
  if (input.supplier) checkPartyRules(input.supplier, 'supplier', issues);
  if (input.customer) checkPartyRules(input.customer, 'customer', issues);
  checkBuyer(input, issues);
  checkTaxes(input, calc, issues);
  checkPayment(input, issues);
  checkDelivery(input, issues);
  checkReferences(input, issues);
  checkProfileFields(input, calc, issues);
}
