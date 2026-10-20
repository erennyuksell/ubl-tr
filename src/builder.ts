// shared/lib/ubl-tr/builder.ts
// UBL-TR Invoice Builder — provider-agnostic, npm-extractable
// Builds the standard GİB UBL-TR v1.2.1 InvoiceType JS object
// Works with ANY e-fatura provider (Uyumsoft, Foriba, Logo, etc.)
// 100% GİB UBL-TR compliant — verified against official GİB XML examples

import type {
  UblInvoiceInput,
  UblInvoiceLine,
  UblAddress,
  UblParty,
  UblDelivery,
  UblPaymentMeans,
  UblGoodsItem,
  UblTransportHandlingUnit,
  UblBuildOptions,
  UblBuildXmlOptions,
  UblCalcLineResult,
  UblCalcResult,
  UblInvoiceDocument,
} from './types';
import { assertValidUblInvoiceInput, calculateForBuild, returnReferences } from './validation';
import { UblValidationError } from './errors';
import { toUblXml } from './xml';
import { PRICE_DECIMALS, roundMoney, roundTo, toMinor } from './money';
import {
  DEFAULT_UNIT_CODE,
  DEFAULT_TAX_TYPE_NAME,
  TAX_CODE_NAMES,
  RETURN_INVOICE_TYPE_CODES,
} from './constants';

// ─── Helpers ─────────────────────────────────────────────

/** ISO 8601 date string (YYYY-MM-DD) */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Current time as HH:mm:ss */
function currentTime(): string {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

// ─── Amount to Words (Turkish) ───────────────────────────

const ONES = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
const TENS = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
const SCALES = ['', 'Bin', 'Milyon', 'Milyar', 'Trilyon'];

function threeDigitsToWords(n: number): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  let s = '';
  if (h > 0) s += (h === 1 ? '' : ONES[h] + ' ') + 'Yüz ';
  if (t > 0) s += TENS[t] + ' ';
  if (o > 0) s += ONES[o] + ' ';
  return s.trim();
}

/** Convert numeric amount to Turkish words: 10500.00 → "Yalnız #On Bin Beş Yüz Türk Lirası#" */
function amountToWords(val: number, currencyCode = 'TRY'): string {
  // Split in minor units: `val - Math.floor(val)` carries float noise (1020.29 → 0.2899...).
  const minor = Math.abs(toMinor(val));
  const integer = Math.floor(minor / 100);
  const decimal = minor % 100;

  // Split into groups of 3 digits from right
  const groups: number[] = [];
  let remaining = integer;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  // 0.50 is "Sıfır Türk Lirası Elli Kuruş", not "Sıfır Türk Lirası".
  let words = integer === 0 ? 'Sıfır ' : '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    if (!group) continue;
    // "Bin" (1000) doesn't need "Bir" prefix in Turkish
    if (i === 1 && group === 1) {
      words += 'Bin ';
    } else {
      words += threeDigitsToWords(group) + ' ' + SCALES[i] + ' ';
    }
  }

  const currencyName =
    currencyCode === 'TRY'
      ? 'Türk Lirası'
      : currencyCode === 'USD'
        ? 'Amerikan Doları'
        : currencyCode === 'EUR'
          ? 'Euro'
          : currencyCode;

  let result = `Yalnız #${words.trim()} ${currencyName}`;
  if (decimal > 0) result += ` ${threeDigitsToWords(decimal).trim()} Kuruş`;
  result += '#';
  return result;
}

/**
 * Amount object per UBL-TR format, rounded to kuruş half away from zero (4.015 → 4.02).
 * GİB's schematron allows at most two decimals on the document totals.
 */
function amount(value: number, currency: string) {
  return {
    $value: roundMoney(value),
    $attributes: { currencyID: currency },
  };
}

/** Unit price object: keeps up to eight decimals. */
function priceAmount(value: number, currency: string) {
  return {
    $value: roundTo(value, PRICE_DECIMALS),
    $attributes: { currencyID: currency },
  };
}

/** Detect scheme ID from VKN/TCKN length */
function schemeId(vkn: string): 'TCKN' | 'VKN' {
  return vkn.length === 11 ? 'TCKN' : 'VKN';
}

// ─── Postal Address Builder ──────────────────────────────

function buildPostalAddress(addr: UblAddress) {
  return {
    ...(addr.id ? { ID: addr.id } : {}),
    ...(addr.room ? { Room: addr.room } : {}),
    StreetName: addr.street || '',
    ...(addr.blockName ? { BlockName: addr.blockName } : {}),
    BuildingName: addr.buildingName || '',
    BuildingNumber: addr.buildingNumber || '',
    CitySubdivisionName: addr.district || '',
    CityName: addr.city || '',
    ...(addr.postalZone ? { PostalZone: addr.postalZone } : {}),
    Country: { Name: addr.country ?? 'Türkiye' },
  };
}

function buildExchangeRate(
  sourceCurrency: string,
  targetCurrency: string,
  calculationRate: number,
  date: Date,
) {
  return {
    SourceCurrencyCode: sourceCurrency,
    TargetCurrencyCode: targetCurrency,
    CalculationRate: calculationRate,
    Date: formatDate(date),
  };
}

// ─── Party Builder ───────────────────────────────────────

function buildParty(party: UblParty): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // WebsiteURI
  if (party.webSiteUri) {
    result.WebsiteURI = party.webSiteUri;
  }

  // PartyIdentification — primary VKN/TCKN + additional IDs (MERSISNO, TICARETSICILNO, etc.)
  const identifications: Array<Record<string, unknown>> = [
    { ID: { $value: party.vkn, $attributes: { schemeID: schemeId(party.vkn) } } },
  ];
  if (party.additionalIds?.length) {
    for (const aid of party.additionalIds) {
      identifications.push({ ID: { $value: aid.value, $attributes: { schemeID: aid.schemeID } } });
    }
  }
  result.PartyIdentification = identifications;

  // PartyName
  result.PartyName = { Name: party.title };

  // PostalAddress — GİB zorunlu (pre-flight validation garantiler)
  result.PostalAddress = buildPostalAddress(party.address!);

  // PartyTaxScheme — GİB zorunlu
  result.PartyTaxScheme = { TaxScheme: { Name: party.taxOffice! } };

  // PartyLegalEntity
  if (party.legalEntity) {
    const le: Record<string, unknown> = {};
    if (party.legalEntity.registrationName) {
      le.RegistrationName = party.legalEntity.registrationName;
    }
    if (party.legalEntity.companyId) {
      le.CompanyID = party.legalEntity.companyId;
      if (party.legalEntity.registrationSchemeName) {
        le.CorporateRegistrationScheme = { ID: party.legalEntity.registrationSchemeName };
      }
    }
    if (Object.keys(le).length > 0) {
      result.PartyLegalEntity = le;
    }
  }

  // Contact
  if (party.contact) {
    const contact: Record<string, unknown> = {};
    if (party.contact.phone) contact.Telephone = party.contact.phone;
    if (party.contact.fax) contact.Telefax = party.contact.fax;
    if (party.contact.email) contact.ElectronicMail = party.contact.email;
    if (Object.keys(contact).length > 0) {
      result.Contact = contact;
    }
  }

  // Person (TCKN kişiler)
  if (party.person) {
    result.Person = {
      FirstName: party.person.firstName,
      FamilyName: party.person.familyName,
    };
  }

  // AgentParty (temsilci/acente)
  if (party.agentParty) {
    result.AgentParty = buildParty(party.agentParty);
  }

  return result;
}

// ─── Invoice Line Builder ────────────────────────────────

/**
 * One InvoiceLine. Every amount comes from `calculateInvoice` (`calc`); the input line gives only
 * the descriptive fields (name, codes, references, reasons).
 */
function buildLine(line: UblInvoiceLine, calc: UblCalcLineResult, index: number, currency: string) {
  const taxTypeCode = calc.taxTypeCode;
  const taxName = TAX_CODE_NAMES[taxTypeCode] ?? DEFAULT_TAX_TYPE_NAME;

  // TaxCategoryType order: TaxExemptionReasonCode, TaxExemptionReason, TaxScheme.
  const taxCategory: Record<string, unknown> = {
    ...(line.taxExemptionReasonCode
      ? {
          TaxExemptionReasonCode: line.taxExemptionReasonCode,
          TaxExemptionReason: line.taxExemptionReason ?? '',
        }
      : {}),
    TaxScheme: { Name: taxName, TaxTypeCode: taxTypeCode },
  };

  // ── Item element (GİB XSD order: Description → Name → BrandName → ModelName
  //    → BuyersItemIdentification → SellersItemIdentification → ManufacturersItemIdentification
  //    → OriginCountry → CommodityClassification) ──────────
  const item: Record<string, unknown> = {
    ...(line.description ? { Description: line.description } : {}),
    Name: line.name,
    ...(line.brandName ? { BrandName: line.brandName } : {}),
    ...(line.modelName ? { ModelName: line.modelName } : {}),
  };

  if (line.buyerCode) {
    item.BuyersItemIdentification = { ID: line.buyerCode };
  }
  if (line.sellerCode) {
    item.SellersItemIdentification = { ID: line.sellerCode };
  }
  if (line.manufacturerCode) {
    item.ManufacturersItemIdentification = { ID: line.manufacturerCode };
  }
  if (line.originCountry) {
    item.OriginCountry = { Name: line.originCountry };
  }
  if (line.classificationCode) {
    const classAttr: Record<string, string> = {};
    if (line.classificationName) classAttr.name = line.classificationName;
    if (line.classificationVersion) classAttr.listVersionID = line.classificationVersion;
    item.CommodityClassification = {
      ItemClassificationCode:
        Object.keys(classAttr).length > 0
          ? { $value: line.classificationCode, $attributes: classAttr }
          : line.classificationCode,
    };
  }

  // AdditionalItemProperty — extra info beyond standard BrandName/ModelName
  const additionalProps: Array<{ Name: string; Value: string }> = [];
  if (line.additionalInfoId)
    additionalProps.push({ Name: 'EkBilgiID', Value: line.additionalInfoId });
  if (additionalProps.length > 0) {
    item.AdditionalItemProperty = additionalProps;
  }

  // ── AllowanceCharge: line discount, line surcharge, then document shares ──
  const allowanceCharges = calc.allowanceCharges.map((ac) => {
    const reason =
      ac.reason ??
      (ac.fromDocument ? undefined : ac.isCharge ? line.surchargeReason : line.discountReason);
    return {
      ChargeIndicator: ac.isCharge,
      ...(reason ? { AllowanceChargeReason: reason } : {}),
      ...(ac.multiplierFactor != null ? { MultiplierFactorNumeric: ac.multiplierFactor } : {}),
      Amount: amount(ac.amount, currency),
      BaseAmount: amount(ac.baseAmount, currency),
    };
  });

  // ── WithholdingTaxTotal (tevkifat) ────────────────────
  // TaxableAmount is the VAT the withholding is taken from, not the line net: GİB's viewer
  // prints it as "Tevkifata Tabi İşlem Üzerinden Hes. KDV".
  const withholdingTaxTotal =
    calc.withholdingTaxCode && calc.withholdingTaxAmount > 0
      ? [
          {
            TaxAmount: amount(calc.withholdingTaxAmount, currency),
            TaxSubtotal: [
              {
                TaxableAmount: amount(calc.taxAmount, currency),
                TaxAmount: amount(calc.withholdingTaxAmount, currency),
                Percent: calc.withholdingTaxRate,
                TaxCategory: {
                  TaxScheme: {
                    ...(line.withholdingTaxName ? { Name: line.withholdingTaxName } : {}),
                    TaxTypeCode: calc.withholdingTaxCode,
                  },
                },
              },
            ],
          },
        ]
      : undefined;

  return {
    ID: String(index + 1),
    ...(line.note ? { Note: line.note } : {}),
    InvoicedQuantity: {
      $value: calc.quantity,
      $attributes: { unitCode: line.unitCode ?? DEFAULT_UNIT_CODE },
    },
    LineExtensionAmount: amount(calc.lineAmount, currency),
    // ── References (XSD order: OrderLineReference, DespatchLineReference, Delivery, AllowanceCharge) ──
    ...(line.orderNo
      ? {
          OrderLineReference: [
            {
              LineID: '0',
              OrderReference: {
                ID: line.orderNo,
                ...(line.orderDate ? { IssueDate: line.orderDate } : {}),
              },
            },
          ],
        }
      : {}),
    ...(line.despatchDocNo
      ? {
          DespatchLineReference: [
            {
              LineID: '0',
              DocumentReference: {
                ID: line.despatchDocNo,
                ...(line.despatchDocDate ? { IssueDate: line.despatchDocDate } : {}),
              },
            },
          ],
        }
      : {}),
    // ── Delivery precedes AllowanceCharge in InvoiceLineType ──
    ...(line.delivery ? { Delivery: buildDelivery(line.delivery) } : {}),
    ...(allowanceCharges.length > 0 ? { AllowanceCharge: allowanceCharges } : {}),
    TaxTotal: {
      TaxAmount: amount(calc.taxAmount, currency),
      TaxSubtotal: [
        {
          TaxableAmount: amount(calc.lineAmount, currency),
          TaxAmount: amount(calc.taxAmount, currency),
          Percent: calc.vatRate,
          TaxCategory: taxCategory,
        },
      ],
    },
    ...(withholdingTaxTotal ? { WithholdingTaxTotal: withholdingTaxTotal } : {}),
    Item: item,
    Price: { PriceAmount: priceAmount(calc.price, currency) },
  };
}

// ─── Tax Total Builder ───────────────────────────────────

/** Document TaxTotal: VAT after withholding, one subtotal per rate group (TEVKIFAT.xml). */
function buildTaxTotal(calc: UblCalcResult, currency: string) {
  return {
    TaxAmount: amount(calc.taxTotalAmount, currency),
    TaxSubtotal: calc.taxSubtotals.map((group) => {
      // TaxCategoryType order: TaxExemptionReasonCode, TaxExemptionReason, TaxScheme.
      const taxCategory: Record<string, unknown> = {
        ...(group.taxExemptionReasonCode
          ? { TaxExemptionReasonCode: group.taxExemptionReasonCode }
          : {}),
        ...(group.taxExemptionReasonCode && group.taxExemptionReason
          ? { TaxExemptionReason: group.taxExemptionReason }
          : {}),
        TaxScheme: {
          Name: TAX_CODE_NAMES[group.taxTypeCode] ?? DEFAULT_TAX_TYPE_NAME,
          TaxTypeCode: group.taxTypeCode,
        },
      };
      return {
        TaxableAmount: amount(group.taxableAmount, currency),
        TaxAmount: amount(group.taxAmount, currency),
        Percent: group.vatRate,
        TaxCategory: taxCategory,
      };
    }),
  };
}

// ─── Withholding Tax Total ───────────────────────────────

/**
 * Document-level WithholdingTaxTotal, one subtotal per tevkifat code and rate.
 * TaxableAmount is the VAT the withholding is taken from (see the line builder).
 */
function buildWithholdingTaxTotal(calc: UblCalcResult, lines: UblInvoiceLine[], currency: string) {
  if (calc.withholdingSubtotals.length === 0) return undefined;
  const nameOf = (code: string) =>
    lines.find((line) => line.withholdingTaxCode?.trim() === code && line.withholdingTaxName)
      ?.withholdingTaxName;

  return {
    TaxAmount: amount(calc.withholdingTaxAmount, currency),
    TaxSubtotal: calc.withholdingSubtotals.map((group) => {
      const name = nameOf(group.code);
      return {
        TaxableAmount: amount(group.taxableAmount, currency),
        TaxAmount: amount(group.taxAmount, currency),
        Percent: group.rate,
        TaxCategory: {
          TaxScheme: {
            ...(name ? { Name: name } : {}),
            TaxTypeCode: group.code,
          },
        },
      };
    }),
  };
}

// ─── Delivery Builder ────────────────────────────────────

function buildDelivery(delivery: UblDelivery) {
  const result: Record<string, unknown> = {};

  // ActualDeliveryDate — fiili teslim tarihi
  if (delivery.actualDeliveryDate) {
    result.ActualDeliveryDate = formatDate(delivery.actualDeliveryDate);
  }

  if (delivery.address) {
    result.DeliveryAddress = buildPostalAddress(delivery.address);
  }

  if (delivery.carrierParty) {
    const carrier: Record<string, unknown> = {};
    if (delivery.carrierParty.vkn) {
      carrier.PartyIdentification = [
        {
          ID: {
            $value: delivery.carrierParty.vkn,
            $attributes: { schemeID: schemeId(delivery.carrierParty.vkn) },
          },
        },
      ];
    }
    carrier.PartyName = { Name: delivery.carrierParty.name };
    if (delivery.carrierParty.address) {
      carrier.PostalAddress = buildPostalAddress(delivery.carrierParty.address);
    }
    result.CarrierParty = carrier;
  }

  if (delivery.deliveryTerms) {
    result.DeliveryTerms = {
      ID: { $value: delivery.deliveryTerms, $attributes: { schemeID: 'INCOTERMS' } },
    };
  }

  if (delivery.shipment) {
    const s = delivery.shipment;
    const weightUnit = s.weightUnit ?? 'KGM';
    const shipCurrency = s.currency ?? 'TRY';
    const shipment: Record<string, unknown> = { ID: '' };

    if (s.grossWeight != null) {
      shipment.GrossWeightMeasure = {
        $value: s.grossWeight,
        $attributes: { unitCode: weightUnit },
      };
    }
    if (s.netWeight != null) {
      shipment.NetWeightMeasure = { $value: s.netWeight, $attributes: { unitCode: weightUnit } };
    }
    if (s.totalPackages != null) {
      shipment.TotalTransportHandlingUnitQuantity = s.totalPackages;
    }
    if (s.insuranceValue != null) {
      shipment.InsuranceValueAmount = amount(s.insuranceValue, shipCurrency);
    }
    if (s.declaredValue != null) {
      shipment.DeclaredForCarriageValueAmount = amount(s.declaredValue, shipCurrency);
    }

    // GoodsItem — GTİP details for export invoices
    if (s.goodsItems?.length) {
      shipment.GoodsItem = s.goodsItems.map((gi: UblGoodsItem) => {
        const item: Record<string, unknown> = {};
        if (gi.description) item.Description = gi.description;
        if (gi.quantity != null) {
          item.Quantity = { $value: gi.quantity, $attributes: { unitCode: gi.unitCode ?? 'NIU' } };
        }
        if (gi.statisticalValue != null) {
          item.StatisticalValueAmount = amount(gi.statisticalValue, shipCurrency);
        }
        if (gi.requiredCustomsId) {
          item.RequiredCustomsID = gi.requiredCustomsId;
        }
        return item;
      });
    }

    if (s.transportModeCode) {
      shipment.ShipmentStage = [{ TransportModeCode: s.transportModeCode }];
    }

    // TransportHandlingUnit — package details
    if (s.transportHandlingUnits?.length) {
      shipment.TransportHandlingUnit = s.transportHandlingUnits.map(
        (thu: UblTransportHandlingUnit) => {
          const unit: Record<string, unknown> = {};
          if (thu.transportHandlingUnitTypeCode) {
            unit.TransportHandlingUnitTypeCode = thu.transportHandlingUnitTypeCode;
          }
          if (thu.actualPackageQuantity != null || thu.actualPackageType) {
            unit.ActualPackage = {
              ...(thu.actualPackageId ? { ID: thu.actualPackageId } : {}),
              ...(thu.actualPackageQuantity != null ? { Quantity: thu.actualPackageQuantity } : {}),
              ...(thu.actualPackageType ? { PackagingTypeCode: thu.actualPackageType } : {}),
            };
          }
          return unit;
        },
      );
    }

    result.Shipment = shipment;
  }

  return result;
}

// ─── PaymentMeans Builder ────────────────────────────────

function buildPaymentMeans(pm: UblPaymentMeans) {
  const result: Record<string, unknown> = {
    PaymentMeansCode: pm.code,
  };

  if (pm.dueDate) {
    result.PaymentDueDate = formatDate(pm.dueDate);
  }

  if (pm.financialAccount) {
    const fa: Record<string, unknown> = {
      ID: pm.financialAccount.iban,
    };
    if (pm.financialAccount.currencyCode) {
      fa.CurrencyCode = pm.financialAccount.currencyCode;
    }
    if (pm.financialAccount.paymentNote) {
      fa.PaymentNote = pm.financialAccount.paymentNote;
    }
    if (pm.financialAccount.branchName || pm.financialAccount.bankName) {
      const branch: Record<string, unknown> = {};
      if (pm.financialAccount.branchName) {
        branch.Name = pm.financialAccount.branchName;
      }
      if (pm.financialAccount.bankName) {
        branch.FinancialInstitution = { Name: pm.financialAccount.bankName };
      }
      fa.FinancialInstitutionBranch = branch;
    }
    result.PayeeFinancialAccount = fa;
  }

  return result;
}

// ─── Main Builder ────────────────────────────────────────

/**
 * Build a standard GİB UBL-TR v1.2.1 Invoice JS object.
 *
 * Returns a plain JS object representing the UBL-TR InvoiceType.
 * Provider-specific wrappers (Uyumsoft InvoiceInfo, Foriba, etc.)
 * should consume this output and add their own envelope.
 *
 * 100% GİB UBL-TR compliant:
 * - All 20 InvoiceTypeCodes, 11 ProfileIDs
 * - WithholdingTaxTotal (TEVKIFAT)
 * - TaxExemptionReasonCode (ISTISNA)
 * - Multi-currency + exchange rate
 * - Header AllowanceCharge
 * - All reference types
 * - UUID, UBLExtensions, Signature (with schemeID)
 * - Contact, Person, LegalEntity (full Party)
 * - Delivery + Shipment (İhracat)
 * - PaymentMeans with financial account (IBAN)
 */
export function buildUblInvoice(
  input: UblInvoiceInput,
  options: UblBuildOptions = {},
): UblInvoiceDocument {
  if (options.validate !== false) {
    assertValidUblInvoiceInput(input, options);
  }
  // Every amount below comes from the calculator. With `validate: false` the header, party and
  // supplied-amount checks are skipped, but an input the calculator cannot compute (unknown
  // tevkifat code, withholding without a code, negative amount) still throws: there would be no
  // correct number to write, and the old `9015` fallback is a document GİB rejects.
  const { calc, issues } = calculateForBuild(input, options);
  if (issues.length > 0) throw new UblValidationError(issues);

  const currency = input.currency || 'TRY';
  // Emitted whenever a line carries withholding; validation rejects it on a type GİB does not
  // allow it on (SATIS and the like) instead of dropping it and leaving the totals inconsistent.
  const withholdingTaxTotal = buildWithholdingTaxTotal(calc, input.lines, currency);

  // Merge notes[] + description + amount-in-words into Note array
  const allNotes: string[] = [];
  if (input.notes?.length) allNotes.push(...input.notes);
  if (input.description && !allNotes.includes(input.description)) allNotes.push(input.description);
  // Auto-add yazıyla tutar notu (Uyumsoft uyumu)
  if (calc.payableAmount) {
    allNotes.push(amountToWords(calc.payableAmount, input.currency));
  }

  return {
    // ── UBL Extensions (imza placeholder) ────────────
    UBLExtensions: {
      UBLExtension: [
        {
          ExtensionContent: {},
        },
      ],
    },

    // ── Header ───────────────────────────────────────
    UBLVersionID: '2.1',
    CustomizationID: 'TR1.2',
    ProfileID: input.profileId,
    ID: input.invoiceNo,
    CopyIndicator: false,
    ...(input.uuid ? { UUID: input.uuid } : {}),
    IssueDate: formatDate(input.issueDate),
    IssueTime: input.issueTime || currentTime(),
    InvoiceTypeCode: input.invoiceTypeCode,

    ...(allNotes.length ? { Note: allNotes } : {}),

    // ── Currency (XSD position #15-#18) ─────────────────
    DocumentCurrencyCode: currency,
    ...(input.taxCurrencyCode ? { TaxCurrencyCode: input.taxCurrencyCode } : {}),
    ...(input.pricingCurrencyCode ? { PricingCurrencyCode: input.pricingCurrencyCode } : {}),
    ...(input.paymentCurrencyCode ? { PaymentCurrencyCode: input.paymentCurrencyCode } : {}),

    LineCountNumeric: input.lines.length,

    // ── Invoice Period ───────────────────────────────
    ...(input.invoicePeriodStart && input.invoicePeriodEnd
      ? {
          InvoicePeriod: {
            StartDate: formatDate(input.invoicePeriodStart),
            EndDate: formatDate(input.invoicePeriodEnd),
          },
        }
      : {}),

    // ── Order Reference (XSD #28) ─────────────────
    ...(input.orderReference
      ? {
          OrderReference: {
            ID: input.orderReference.id,
            ...(input.orderReference.issueDate
              ? { IssueDate: input.orderReference.issueDate }
              : {}),
          },
        }
      : {}),

    // ── Billing Reference (XSD #29 — IADE → orijinal fatura) ──
    ...(RETURN_INVOICE_TYPE_CODES.includes(input.invoiceTypeCode) && returnReferences(input).length
      ? {
          // DocumentReference order (XSD): ID, IssueDate, DocumentTypeCode.
          BillingReference: returnReferences(input).map((reference) => ({
            InvoiceDocumentReference: {
              ID: reference.invoiceNo,
              IssueDate: reference.issueDate
                ? formatDate(new Date(reference.issueDate))
                : formatDate(input.issueDate),
              DocumentTypeCode: 'IADE',
            },
          })),
        }
      : {}),

    // ── Despatch Document Reference (XSD #30) ────────────
    ...(input.despatchDocumentNo
      ? {
          DespatchDocumentReference: [
            {
              ID: input.despatchDocumentNo,
              IssueDate: formatDate(input.issueDate),
            },
          ],
        }
      : {}),

    // ── Receipt Document Reference (XSD #31) ─────────────
    ...(input.receiptDocumentNo
      ? {
          ReceiptDocumentReference: [
            {
              ID: input.receiptDocumentNo,
              ...(input.receiptDocumentDate ? { IssueDate: input.receiptDocumentDate } : {}),
            },
          ],
        }
      : {}),

    // ── Contract Document Reference (XSD #33) ────────────
    ...(input.contractDocumentNo
      ? {
          ContractDocumentReference: {
            ID: input.contractDocumentNo,
            ...(input.contractDocumentDate ? { IssueDate: input.contractDocumentDate } : {}),
          },
        }
      : {}),

    // ── Additional Document Reference (XSD #34) ──────────
    ...(input.additionalDocumentReferences?.length
      ? {
          AdditionalDocumentReference: input.additionalDocumentReferences.map((ref) => ({
            ID: ref.id,
            ...(ref.issueDate ? { IssueDate: ref.issueDate } : {}),
            ...(ref.documentType ? { DocumentType: ref.documentType } : {}),
            ...(ref.documentDescription ? { DocumentDescription: ref.documentDescription } : {}),
          })),
        }
      : {}),

    // ── Signature (with GİB-compliant schemeID) ──────
    Signature: [
      {
        ID: { $value: input.supplier.vkn, $attributes: { schemeID: 'VKN_TCKN' } },
        SignatoryParty: {
          PartyIdentification: [
            {
              ID: {
                $value: input.supplier.vkn,
                $attributes: { schemeID: schemeId(input.supplier.vkn) },
              },
            },
          ],
          ...(input.supplier.address
            ? {
                PostalAddress: buildPostalAddress(input.supplier.address),
              }
            : {}),
        },
        DigitalSignatureAttachment: {
          ExternalReference: { URI: '#Signature' },
        },
      },
    ],

    // ── Supplier (Satıcı) ────────────────────────────
    AccountingSupplierParty: {
      Party: buildParty(input.supplier),
    },

    // ── Customer (Alıcı) ─────────────────────────────
    AccountingCustomerParty: {
      Party: buildParty(input.customer),
    },

    ...(input.buyerCustomer
      ? {
          BuyerCustomerParty: {
            Party: buildParty(input.buyerCustomer),
          },
        }
      : {}),

    // ── Delivery (İhracat / Nakliye) ─────────────────
    ...(input.delivery
      ? {
          Delivery: buildDelivery(input.delivery),
        }
      : {}),

    // ── Payment Means ────────────────────────────────
    ...(input.paymentMeans
      ? {
          PaymentMeans: [buildPaymentMeans(input.paymentMeans)],
        }
      : input.paymentMeansCode
        ? {
            PaymentMeans: [
              {
                PaymentMeansCode: input.paymentMeansCode,
                ...(input.dueDate ? { PaymentDueDate: formatDate(input.dueDate) } : {}),
              },
            ],
          }
        : {}),

    // ── Payment Terms ────────────────────────────────
    ...(input.dueDate
      ? {
          PaymentTerms: { PaymentDueDate: formatDate(input.dueDate) },
        }
      : {}),

    // Document-level allowances and charges are not written here: the calculator spreads them
    // over the lines, where each share is an AllowanceCharge of the line (and its VAT follows).

    // ── Exchange Rate ────────────────────────────────
    ...(input.exchangeRate && currency !== 'TRY'
      ? {
          TaxExchangeRate: buildExchangeRate(currency, 'TRY', input.exchangeRate, input.issueDate),
          PricingExchangeRate: buildExchangeRate(
            currency,
            'TRY',
            input.exchangeRate,
            input.issueDate,
          ),
          PaymentExchangeRate: buildExchangeRate(
            currency,
            'TRY',
            input.exchangeRate,
            input.issueDate,
          ),
        }
      : {}),

    // ── Tax Total ────────────────────────────────────
    TaxTotal: buildTaxTotal(calc, currency),

    // ── Withholding Tax Total (TEVKIFAT) ─────────────
    ...(withholdingTaxTotal ? { WithholdingTaxTotal: [withholdingTaxTotal] } : {}),

    // ── Legal Monetary Total ─────────────────────────
    LegalMonetaryTotal: {
      // Before discounts, as in GİB's TicariFaturaOrnegi.xml (26003.40 = 25216.50 + 786.90).
      // Surcharges stay inside it: GİB's viewer shows no ChargeTotalAmount.
      LineExtensionAmount: amount(calc.lineExtensionAmount, currency),
      TaxExclusiveAmount: amount(calc.taxExclusiveAmount, currency),
      // TEVKIFAT.xml: TaxInclusiveAmount 23600 (full VAT), PayableAmount 20360 (withholding off).
      TaxInclusiveAmount: amount(calc.taxInclusiveAmount, currency),
      AllowanceTotalAmount: amount(calc.allowanceTotalAmount, currency),
      // UBL 2.1 order: PayableRoundingAmount right before PayableAmount, only when there is one.
      ...(calc.payableRoundingAmount !== 0
        ? { PayableRoundingAmount: amount(calc.payableRoundingAmount, currency) }
        : {}),
      PayableAmount: amount(calc.payableAmount, currency),
    },

    // ── Invoice Lines ────────────────────────────────
    InvoiceLine: input.lines.map((line, i) => buildLine(line, calc.lines[i]!, i, currency)),
  } as UblInvoiceDocument;
}

export function buildUblInvoiceXml(
  input: UblInvoiceInput,
  options: UblBuildXmlOptions = {},
): string {
  return toUblXml(buildUblInvoice(input, options), options);
}
