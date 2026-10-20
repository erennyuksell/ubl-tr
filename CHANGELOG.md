# Changelog

All notable changes to this package will be documented in this file.

## 0.4.1

### Fixed

- A buyer without a VKN (the foreign buyer of an export or a tax-free sale) got an empty
  `cbc:ID schemeID="VKN"` and an empty tax scheme. A party now gets a VKN/TCKN line only when it has
  one, and no empty name or tax scheme.

### Added

- The party type GİB requires on the buyer: `PARTYTYPE` `EXPORT` on an `IHRACAT` invoice and
  `TAXFREE` on a `YOLCUBERABERFATURA` invoice, written from the profile (`BUYER_PARTY_TYPES`).
- `person.nationalityId` and `person.passport` (written as `NationalityID` and
  `IdentityDocumentReference`), and `taxRepresentative`, the intermediary of a tax-free sale (written
  as `TaxRepresentativeParty` with `ARACIKURUMVKN` and `ARACIKURUMETIKET`).
- `COUNTRY_CODES`, GİB's country code list.
- Validation of the buyer as GİB's schematron asks: the official name on an export; the tourist's
  name, nationality and passport and the intermediary on a tax-free sale. A buyer under another
  profile needs an identification. The schema test covers both invoices.

## 0.4.0

The XML now passes GİB's UBL-TR 1.2.1 schema, which 0.3.0's did not (its elements had no
namespace prefixes), and validation follows GİB's current e-Fatura schematron (package of
2026-08-21) on profile and invoice type pairs. Several checks reject input 0.3.0 accepted, hence
the minor version.

### Added

- `InvoiceParser` returns the document notes as `notes` (every `cbc:Note`, in order, empty ones left
  out). Sellers write references there, such as the order or project number an invoice belongs to.
- `InvoiceParser` also returns `billingReferences` (number, date and type of each referred invoice),
  `paymentMeans` (code, due date, IBAN, bank) and each line's `notes`.
- `billingReferences` on `UblInvoiceInput`: a return can refer to several invoices. The single
  `billingReferenceInvoiceNo` and `billingReferenceIssueDate` are deprecated and merged in.
- `isValidVkn`, `isValidTckn`, `isValidTaxId`, `FINAL_CONSUMER_TCKN`, `FOREIGN_BUYER_VKN`.
- A test that checks the XML of eight invoice kinds against GİB's UBL-TR 1.2.1 schema (run with
  `UBL_TR_XSD`, see Development in the README).

### Fixed

- The XML had no namespace prefixes on its elements (`<ID>` instead of `<cbc:ID>`), so every element
  sat in the Invoice namespace and GİB's schema refused the document. Elements are now written as
  `cbc:`, `cac:` and `ext:`.
- `TaxExemptionReasonCode` and `TaxExemptionReason` were written after `TaxScheme`; the schema wants
  them before it, so exemption (`ISTISNA`) invoices were refused.
- A `BillingReference` wrote `IssueDate` and `DocumentTypeCode` out of the schema's order.

### Changed

- Validation checks VKN and TCKN check digits. GİB's schematron checks only the length, so a
  mistyped number that 0.3.0 accepted went out addressed to a wrong or unknown taxpayer; it is now
  an issue on `supplier.vkn` or `customer.vkn`. GİB's placeholders `11111111111` and `2222222222`
  pass. Every VKN and TCKN read from 82 real e-invoices passes the check.
- Validation refuses a control character XML cannot carry in any text field.
- Validation checks the profile against the invoice type as GİB's e-Fatura schematron of
  2026-08-21 does (new `INVOICE_TYPE_PROFILE_IDS` and `PROFILE_INVOICE_TYPE_CODES`). An `IADE` under
  `TICARIFATURA`, which 0.3.0 built and GİB refuses, is now an issue on `profileId`; GİB's older
  UBL-TR 1.2.1 sample `IadeFaturasiOrnegi.xml` shows that pair, the current schematron does not
  allow it.
- The return reference issue is reported on `billingReferences` (none given) or
  `billingReferences[i].invoiceNo` (wrong length), no longer on `billingReferenceInvoiceNo`.

- `InvoiceParser.parse` refuses a document with a DOCTYPE or an ENTITY declaration and throws the new
  `UblParseError` (`reason: 'doctype-not-allowed'`). UBL-TR invoices have neither; a declared entity
  could expand without bound or reach outside the document. A caller that parsed such a document
  before now gets an error.

## 0.3.0

The package now calculates the invoice. `calculateInvoice` turns the business inputs (quantity,
price or a VAT-inclusive line amount, discount and surcharge rates or amounts, VAT rate,
tevkifat code, document discounts) into every amount of the document, and `buildUblInvoice`
writes only what it returns. Rounding, validation and GİB now agree, so correct invoices are no
longer rejected before they reach the provider, and invoices GİB would reject are stopped before
they leave. Several checks reject input 0.2.0 accepted, hence the minor version.

### Breaking

- Supplied amounts are checks, and must equal the calculation exactly. Line `lineAmount`,
  `taxAmount`, `withholdingTaxRate`, `withholdingTaxAmount` and the header `taxExclusiveAmount`,
  `taxAmount`, `discount`, `payableAmount` may be left out (they are now optional); when given,
  any difference fails validation and the build. The `tolerance` option, and the bare number
  second argument of `validateUblInvoiceInput` / `assertValidUblInvoiceInput`, are gone.
- A line's VAT is `round(net × rate)` (or its rate group's share with `rounding: 'document'`), or,
  on a line given with `vatInclusiveAmount`, the VAT inside that amount; there is no way to pass
  a VAT amount in. 0.2.0 accepted a cent of drift on every line amount and on the totals. A fixed
  total that net-priced lines miss is closed with `payableRoundingAmount`
  (LegalMonetaryTotal/PayableRoundingAmount), at most one kuruş per line.
- Withholding (tevkifat) takes its rate from the code (`WITHHOLDING_TAX_CODES`); an unknown code,
  or a supplied rate other than GİB's for the code (606 is 9/10, 801-825 are 10/10), is rejected.
  The builder no longer falls back to `9015`, which GİB rejects inside `WithholdingTaxTotal`: a
  withholding line without a code throws even with `validate: false`.
- Withholding lines are rejected on an invoice type that does not allow them (`SATIS`,
  `TEVKIFATIADE`, ...; `WITHHOLDING_INVOICE_TYPE_CODES`). 0.2.0 dropped the document
  `WithholdingTaxTotal` on such types and left the totals inconsistent.
- Return types (`IADE`, `TEVKIFATIADE`, `YTBIADE`, `YTBTEVKIFATIADE`;
  `RETURN_INVOICE_TYPE_CODES`) require `billingReferenceInvoiceNo`, the returned invoice's
  16-character number, as GİB's schematron does. `BillingReference` is now written on all four,
  not only `IADE`.
- `headerAllowanceCharges` are document discounts and charges that the calculator spreads over
  the lines by net amount (largest remainder, whole kuruş); each share is written as an
  AllowanceCharge of its line and the line's VAT follows it. They are no longer written as a
  document-level AllowanceCharge that the totals ignored. `percent` is a percent (5 = 5%);
  `amount` is optional when `percent` is given.
- `TaxInclusiveAmount` holds the net plus the full VAT; `PayableAmount` has the withholding taken
  off, as in GİB's `TEVKIFAT.xml`. 0.2.0 wrote the VAT after withholding into
  `TaxInclusiveAmount`.
- Negative discounts and surcharges, and a discount larger than its line, are rejected.
- `UblValidationError` also comes from the calculator; `calculateInvoiceTotals` is deprecated in
  favour of `calculateInvoice` and throws when a line cannot be computed.

### Added

- `calculateInvoice(input, { rounding })`: every line's price (VAT-exclusive, eight decimals),
  allowances and charges, net amount, VAT and withholding, and the document's line extension,
  allowance and charge totals, tax exclusive and inclusive amounts, VAT subtotals per rate,
  withholding subtotals and payable amount. `rounding: 'line'` (default, as in GİB's examples)
  or `'document'` (one rounding per rate group, spread over its lines). Reproduces GİB's
  `TicariFaturaOrnegi.xml` and `TEVKIFAT.xml` to the kuruş.
- Line input `vatInclusiveAmount`: a line sold at a VAT-inclusive price. The VAT is taken out of
  the amount, `round(amount × rate / (100 + rate))`, the net is the rest and the unit price is
  derived, so the invoice comes to the amount charged exactly (1000.05 at 20%: 833.37 + 166.68).
  Not combined with discount or surcharge rates, document allowances or `rounding: 'document'`.
- `splitVatInclusive(amount, vatRate)`: the same split without a line, `{ lineAmount, taxAmount }`.
- `payableRoundingAmount` input and result, written as `PayableRoundingAmount` and read by
  `InvoiceParser`.
- `allocateAmount(total, weights)`: an amount shared by weight in whole kuruş (largest
  remainder).
- `@erennyuksell/ubl-tr/calc`: the calculator, the VAT-inclusive split, the money helpers and the code
  tables without the XML builder and parser (no dependency), for browser forms.
- `WITHHOLDING_TAX_CODES` (with the `UblWithholdingTaxCode` type): GİB tevkifat codes 601-627
  and 801-825 with their name and rate. Every code was accepted at its rate by the schematron of
  Uyumsoft's test environment; 650 is not included because that schematron rejects it.
- `WITHHOLDING_INVOICE_TYPE_CODES` and `RETURN_INVOICE_TYPE_CODES`.
- Money helpers: `roundMoney`, `roundTo`, `toMinor`, `fromMinor`, `sumInMinor`.
- Line input `discountRate`.
- `InvoiceParser` reads each line's `discount`, `surchargeAmount`, `allowanceCharges` and
  `withholdings`, and the document's `lineExtensionAmount`, `allowanceTotalAmount`,
  `withholdingTaxAmount` and `withholdingTaxSubtotals`. Existing fields are unchanged.

### Fixed

- Amounts round half away from zero in whole kuruş (`2.135` → `2.14`, `40.15 × 10%` → `4.02`),
  with exact integer arithmetic for rates. `toFixed(2)` rounded the binary value instead.
- `PriceAmount` keeps up to eight decimals instead of two, so quantity × price matches
  `LineExtensionAmount`.
- `MultiplierFactorNumeric` is written as a fraction (`0.05` for 5%), as in GİB's examples. GİB's
  viewer multiplies it by 100, so the old percent showed as 500%. The stated rate is used when
  it reproduces the amount and the amounts otherwise.
- Withholding: each line gets its own `WithholdingTaxTotal`; the document one is written whenever
  a line carries withholding, with the VAT as `TaxableAmount`.
- Surcharges (artırım) are written as `AllowanceCharge` with `ChargeIndicator=true`.
- Line elements follow the XSD order: `Delivery` before `AllowanceCharge`.
- The amount in words is split in whole kuruş (`1020.29` no longer risks float noise), and an
  amount under one lira keeps its kuruş (`0.50` is "Sıfır Türk Lirası Elli Kuruş", not
  "Sıfır Türk Lirası").

### Not changed

- A `TEVKIFAT` invoice without withholding lines is still accepted: the same schematron accepts
  it.
- `rounding: 'line'` stays the default. A line-by-line invoice whose rate group differs from
  `round(Σ net × rate)` (`40.15` and `160.45` at 10%: `20.07` against `20.06`) is accepted by
  GİB's schematron, so there is no group-level check.

## 0.2.0

- Add `providerAssignedInvoiceNo` build/validation option. When set, a blank `invoiceNo` is
  accepted and passed through to `cbc:ID` unchanged, so e-document providers that allocate the
  number themselves (from a registered series, or from a submitted 3-character series prefix)
  can be driven directly. All other validation rules still apply.
- `validateUblInvoiceInput` and `assertValidUblInvoiceInput` now take a `UblValidationOptions`
  object as their second argument. A bare `tolerance` number is still accepted.
- Export the `UblValidationOptions` type.

## 0.1.1

- Expand README API documentation.

## 0.1.0

- Initial provider-independent UBL-TR invoice builder.
- Initial UBL-TR XML parser.
- UBL-TR XML serializer.
- Input validation and line total calculation helpers.
- TypeScript declarations, ESM build, and CommonJS build.
