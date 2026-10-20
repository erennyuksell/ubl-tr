# @erennyuksell/ubl-tr

TypeScript utilities for calculating, building, validating, serializing, and parsing Turkish UBL-TR e-invoice documents.

This package does the invoice arithmetic and produces the UBL-TR XML. Business decisions are its
input: the VAT rate, the tevkifat code, whether a price includes VAT, the discount you grant.
`calculateInvoice` turns them into every amount the document carries (line amounts, VAT,
withholding, totals, in whole kuruş with one rounding each), and `buildUblInvoice` writes those
amounts and nothing else. Use the same calculator in your forms and on your server, and the
number the user sees is the number GİB receives.

It is a provider-independent UBL-TR layer: your application maps its invoice data into a
standard `UblInvoiceInput`, and the package returns a UBL-TR document object or XML string.

It does not send invoices, sign XML, call GIB services, or integrate with Uyumsoft/Foriba/Logo directly. Use a provider SDK for those jobs.

## Install

```bash
npm install @erennyuksell/ubl-tr
```

```ts
import {
  InvoiceParser,
  buildUblInvoice,
  buildUblInvoiceXml,
  calculateInvoice,
  splitVatInclusive,
  toUblXml,
  validateUblInvoiceInput,
} from '@erennyuksell/ubl-tr';
```

## Mental Model

Every application stores invoices differently. One app may have `customerName`, another may have `buyer.legalName`, another may have `CariUnvan`.

This package does not try to understand every possible application model. Your app maps its own invoice model into the package's canonical input DTO:

```ts
YourInvoiceModel -> your mapper -> UblInvoiceInput -> calculateInvoice -> UBL-TR document object -> XML
```

The package starts working at `UblInvoiceInput`.

```ts
const ublDocument = buildUblInvoice(ublInput); // typed UBL-TR object
const xml = buildUblInvoiceXml(ublInput); // final XML string
```

`buildUblInvoiceXml(input)` is equivalent to:

```ts
toUblXml(buildUblInvoice(input));
```

Use `buildUblInvoice` when another adapter or SDK needs to inspect or wrap the UBL document. Use `buildUblInvoiceXml` when you need the XML payload.

## What It Does

- Calculates the invoice from its business inputs (`calculateInvoice`), including VAT-inclusive
  prices, line and document discounts and surcharges and tevkifat. A net-priced line's VAT is
  `round(net × rate)`; a VAT-inclusive line's VAT is taken out of its amount. No input passes a
  VAT amount in.
- Invoices a sale at a VAT-inclusive price for exactly the amount charged (`vatInclusiveAmount`,
  `splitVatInclusive`).
- Converts `UblInvoiceInput` into a GIB UBL-TR invoice document object.
- Serializes UBL-TR document objects into XML.
- Validates required invoice fields, parties, lines, totals, and tax amounts.
- Parses existing UBL-TR XML into a simpler typed data shape.
- Provides common GIB tax/unit constants and TypeScript types.
- Supports common e-Fatura/e-Arsiv fields, tevkifat, istisna, references, payment, delivery, shipment, and multi-currency metadata.

## What It Does Not Do

- It does not call Uyumsoft, Foriba, Logo, Kolaysoft, GIB, or any private integrator API.
- It does not send, cancel, archive, query, or download invoices.
- It does not apply XML digital signatures or mali muhur.
- It does not store files or talk to your database.
- It does not know your CRM/ERP field names.

For example, with Uyumsoft the normal architecture is:

```ts
CRM invoice -> mapToUblInput() -> @erennyuksell/ubl-tr -> UBL document/XML
UBL document/XML -> Uyumsoft SDK/provider adapter -> SOAP/API send
```

## Quick Start

```ts
import {
  buildUblInvoice,
  buildUblInvoiceXml,
  calculateInvoice,
  type UblInvoiceInput,
  type UblInvoiceLine,
} from '@erennyuksell/ubl-tr';

// Your app can use any field names it wants.
const appInvoice = {
  number: 'ABC2026000000001',
  issuedAt: new Date('2026-05-25T09:00:00+03:00'),
  buyerTitle: 'Customer Name',
};

const lines: UblInvoiceLine[] = [
  {
    name: 'Software service',
    quantity: 1,
    unitCode: 'NIU',
    price: 1000,
    vatRate: 20,
  },
];

// Every amount, for your screen or your database: 1000 net, 200 VAT, 1200 payable.
const totals = calculateInvoice({ lines });

const ublInput: UblInvoiceInput = {
  invoiceNo: appInvoice.number,
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  issueDate: appInvoice.issuedAt,
  profileId: 'TEMELFATURA',
  invoiceTypeCode: 'SATIS',
  currency: 'TRY',
  supplier: {
    vkn: '1234567890',
    title: 'Supplier A.S.',
    taxOffice: 'Istanbul',
    address: {
      street: 'Example Street',
      city: 'Istanbul',
      district: 'Kadikoy',
      country: 'Turkiye',
    },
  },
  customer: {
    vkn: '11111111111',
    title: appInvoice.buyerTitle,
    taxOffice: 'Istanbul',
    address: {
      street: 'Customer Street',
      city: 'Istanbul',
      district: 'Besiktas',
      country: 'Turkiye',
    },
  },
  lines,
};

const ublDocument = buildUblInvoice(ublInput); // amounts from calculateInvoice
const xml = buildUblInvoiceXml(ublInput);
```

You may still pass the amounts you computed (`lineAmount`, `taxAmount`, the header totals): they
are then checks, and any that differs from `calculateInvoice` by a kuruş fails the build.

## Public API

### `calculateInvoice(input, options?)`

Every amount of the invoice from its business inputs.

```ts
import { calculateInvoice } from '@erennyuksell/ubl-tr';

const calc = calculateInvoice(
  {
    lines: [
      { quantity: 12, price: 825.5, discountRate: 5, vatRate: 18 },
      { quantity: 1, price: 0, vatInclusiveAmount: 1200, vatRate: 20 },
      { quantity: 1, price: 20000, vatRate: 18, withholdingTaxCode: '606' },
    ],
    headerAllowanceCharges: [{ isCharge: false, percent: 2, reason: 'Genel iskonto' }],
  },
  { rounding: 'line' },
);

calc.lines[0].lineAmount; // net after discounts
calc.lines[2].withholdingTaxAmount; // 9/10 of the VAT, from the 606 code
calc.taxSubtotals; // VAT per rate
calc.payableAmount;
```

Line inputs (`UblCalcLine`):

```ts
type UblCalcLine = {
  quantity: number;
  price: number; // VAT-exclusive; not read when vatInclusiveAmount is given
  vatInclusiveAmount?: number; // the line's amount with VAT; the VAT is taken out of it
  discount?: number; // amount; wins over discountRate
  discountRate?: number; // percent of quantity × price
  surchargeAmount?: number; // artırım amount; wins over surchargeRate
  surchargeRate?: number;
  vatRate: number; // percent
  taxTypeCode?: string; // default 0015
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
  withholdingTaxCode?: string; // rate from WITHHOLDING_TAX_CODES
};
// Document level: `payableRoundingAmount` (PayableRoundingAmount), see below.
```

Document discounts and charges (`headerAllowanceCharges`, percent of the lines' net total or an
amount) are spread over the lines by net amount, largest remainder, whole kuruş; each share is an
AllowanceCharge of its line and the line's VAT is computed on what it really costs.

The result (`UblCalcResult`) has, per line, the VAT-exclusive `price`, `grossAmount`
(quantity × price), `allowanceCharges`, `discount`, `surchargeAmount`, `lineAmount`, `taxAmount`,
`withholdingTaxRate` and `withholdingTaxAmount`; and for the document `lineExtensionAmount`,
`allowanceTotalAmount`, `chargeTotalAmount`, `taxExclusiveAmount`, `vatAmount` (before
withholding), `taxTotalAmount` (after withholding, as GİB's TaxTotal), `taxInclusiveAmount`,
`taxSubtotals`, `withholdingTaxAmount`, `withholdingSubtotals`, `payableRoundingAmount` and
`payableAmount`.

Rounding: every amount is rounded once, half away from zero, in whole kuruş (`40.15 × 10%` →
`4.02`, `2.135` → `2.14`); rates are applied with exact integer arithmetic.

- `rounding: 'line'` (default): each line's VAT is `round(net × rate)`, as in GİB's examples
  (`TicariFaturaOrnegi.xml` and `TEVKIFAT.xml` are reproduced to the kuruş), or taken out of its
  `vatInclusiveAmount` (below).
- `rounding: 'document'`: one `round(Σ net × rate)` per rate group, spread over its lines.

It throws `UblValidationError` when an input cannot be computed: a negative amount, a discount
larger than its line, an unknown tevkifat code, a `payableRoundingAmount` over one kuruş per line.

### Selling at a VAT-inclusive price: `vatInclusiveAmount`

A web shop or a subscription is sold at a VAT-inclusive price, and that price is what the customer
is shown and charged. Give such a line `vatInclusiveAmount` instead of a price: the VAT is taken
out of the amount, `round(amount × rate / (100 + rate))` half away from zero, the net is the rest,
and the unit price is derived from the net. The line, and the invoice, come to the amount exactly.

This is how VAT-inclusive prices are invoiced elsewhere too (Stripe, Shopify): the price stays,
the VAT is extracted from it. Pricing from a net instead cannot reach every amount: at 20% no net
`n` gives `n + round(n × 20%)` = 1000.05 (833.37 gives 1000.04, 833.38 gives 1000.06). The two
rules never disagree where both apply: the amount of a net-priced line, split this way, gives back
`round(net × rate)`. GİB's schematron checks the document totals, not a line's VAT against a
formula.

```ts
import { calculateInvoice, splitVatInclusive } from '@erennyuksell/ubl-tr';

const calc = calculateInvoice({
  lines: [{ quantity: 1, price: 0, vatInclusiveAmount: 1000.05, vatRate: 20 }],
});
calc.lines[0]; // price 833.37, lineAmount 833.37, taxAmount 166.68
calc.payableAmount; // 1000.05

// The same split without a line, for a price list or an order record.
splitVatInclusive(1000.05, 20); // { lineAmount: 833.37, taxAmount: 166.68 }
```

The line's discount and surcharge are amounts (VAT-exclusive, as on every line); the unit price
is what the net comes from once they are taken back. Rates, document allowances
(`headerAllowanceCharges`) and `rounding: 'document'` are not combined with it: each would move
an amount that is fixed.

### A total that net-priced lines miss: `payableRoundingAmount`

A document whose total cannot move and whose net-priced lines miss it by a kuruş or two, such as
the exact reversal of an invoice issued with another rounding, carries the difference in
`LegalMonetaryTotal/PayableRoundingAmount`. It goes into the payable amount only, never into a
line's VAT, and is limited to one kuruş per line either way. A sale at a VAT-inclusive price
needs none.

```ts
calculateInvoice({
  lines: [
    { quantity: 1, price: 333.33, vatRate: 20 },
    { quantity: 1, price: 83.34, vatRate: 20 },
  ],
  payableRoundingAmount: -0.01,
}).payableAmount; // 500 (TaxInclusiveAmount 500.01)
```

### `allocateAmount(total, weights)`

```ts
import { allocateAmount } from '@erennyuksell/ubl-tr';

// Share an amount in whole kuruş (largest remainder): a partial refund over the lines (each
// share as the line's vatInclusiveAmount), a partial payment between net and VAT.
allocateAmount(600, [1000, 200]); // [500, 100]
allocateAmount(100, [1, 1, 1]); // [33.33, 33.33, 33.34]
```

### In the browser: `@erennyuksell/ubl-tr/calc`

```ts
import { calculateInvoice, splitVatInclusive } from '@erennyuksell/ubl-tr/calc';
```

The calculator, the VAT-inclusive split, the money helpers and the code tables (`WITHHOLDING_TAX_CODES`,
`WITHHOLDING_INVOICE_TYPE_CODES`, `RETURN_INVOICE_TYPE_CODES`), without the XML builder and
parser and without any dependency.

### `buildUblInvoice(input, options?)`

Builds a plain JavaScript object representing a UBL-TR `Invoice` document.

```ts
const document = buildUblInvoice(ublInput);
```

Use it when:

- You want to inspect the generated UBL structure in tests.
- A provider SDK needs an object form before wrapping it.
- You want to call `toUblXml` yourself with custom XML options.

Every number it writes comes from `calculateInvoice`. By default it validates the input before building. Disable validation only when you already validated upstream:

```ts
const document = buildUblInvoice(ublInput, { validate: false });
```

Options:

```ts
type UblBuildOptions = {
  validate?: boolean; // default: true
  rounding?: 'line' | 'document'; // default: 'line', see calculateInvoice
  providerAssignedInvoiceNo?: boolean; // default: false
};
```

`validate: false` skips the header, party and supplied-amount checks, but not what the
calculator needs: an unknown tevkifat code, withholding without a code or a negative amount
still throws `UblValidationError`. There is no fallback to `9015`, a code GİB rejects inside
`WithholdingTaxTotal`.

#### Provider-assigned invoice numbers

Turkish e-document providers usually allocate the invoice number themselves: submit a blank
`cbc:ID` and the provider takes the next number from your registered series, or submit a
3-character series prefix to pick a specific series. Set `providerAssignedInvoiceNo` so a blank
`invoiceNo` is accepted and passed through to `cbc:ID` unchanged:

```ts
const document = buildUblInvoice(
  { ...ublInput, invoiceNo: '' },
  { providerAssignedInvoiceNo: true },
);
// document.ID === ''  → provider allocates the number

const fromSeries = buildUblInvoice(
  { ...ublInput, invoiceNo: 'ABC' },
  { providerAssignedInvoiceNo: true },
);
// document.ID === 'ABC' → provider allocates from the ABC series
```

Every other validation rule still applies. Leave the flag off for standalone UBL-TR documents,
where GİB requires a fully-formed 16-character number.

### `buildUblInvoiceXml(input, options?)`

Builds a UBL-TR XML string directly from `UblInvoiceInput`.

```ts
const xml = buildUblInvoiceXml(ublInput);
```

This is the common choice when you need the final XML payload.

```ts
const compactXml = buildUblInvoiceXml(ublInput, { pretty: false });
const xmlWithoutDeclaration = buildUblInvoiceXml(ublInput, { declaration: false });
```

It combines build and XML options:

```ts
type UblBuildXmlOptions = UblBuildOptions & UblXmlOptions;
```

### `toUblXml(document, options?)`

Serializes a UBL document object into XML.

```ts
const document = buildUblInvoice(ublInput);
const xml = toUblXml(document, {
  pretty: true,
  declaration: true,
});
```

Options:

```ts
type UblXmlOptions = {
  pretty?: boolean; // default: true
  declaration?: boolean; // default: true
  rootName?: string; // default: Invoice
  namespaces?: Record<string, string>; // merged with default UBL namespaces
};
```

Use custom namespaces only if your provider requires a special wrapper or namespace override.

Element names are written with the prefixes GİB's schema expects: `cbc:` for a value, `cac:` for an
element with children, `ext:` for `UBLExtensions`. A name you give with a prefix is kept. The
`ext:ExtensionContent` is left empty: it is the signature's place, filled when the provider signs.

### `calculateInvoiceTotals(lines)` (deprecated)

Deprecated: use `calculateInvoice`, which returns every amount. Kept for callers of 0.2; it now
runs the calculator and returns four of its totals.

```ts
const totals = calculateInvoiceTotals(lines);
```

Returns:

```ts
{
  taxExclusiveAmount: 1000,
  taxAmount: 200,
  discount: 0,
  payableAmount: 1200,
}
```

- `taxExclusiveAmount` is `calculateInvoice(...).taxExclusiveAmount`.
- `taxAmount` is the VAT after withholding (`taxTotalAmount`).
- `discount` is all discounts (`allowanceTotalAmount`).
- `payableAmount` is TaxInclusiveAmount minus withholding.

### `validateUblInvoiceInput(input, options?)`

Validates an input and returns all issues instead of throwing.

```ts
const result = validateUblInvoiceInput(ublInput);

if (!result.valid) {
  console.log(result.issues);
}
```

Returns:

```ts
type UblValidationResult = {
  valid: boolean;
  issues: Array<{
    path: string;
    message: string;
  }>;
};
```

It checks the input rules of GİB's e-Fatura schematron (package of 2026-08-21, in `src/gib-rules.ts`;
`docs/gib-schematron-coverage.md` lists all 299 rules of the file and where each is checked), and:

- Required header fields: `invoiceNo`, `issueDate`, `profileId`, `invoiceTypeCode`.
- Codes against GİB's own lists (`src/gib-codelists.ts`, generated from GİB's code list): profile,
  invoice type, currencies, party identification schemes, tax types, exemption codes, payment
  means, delivery terms, transport modes, package types, nationality.
- The GİB invoice number format (`ABC2026000000001`; with `providerAssignedInvoiceNo`, also blank or
  the 3-character series), a UUID in UUID format, an exchange rate (at most 6 decimals) on every
  invoice not in TRY.
- A TCKN party (11 digits, the final consumer `11111111111` included) needs `person.firstName` and
  `person.familyName`. An invoice to the customs authority (`1460415308`) is an export, a tax-free
  sale, `OZELFATURA` or `KAMU`.
- Exemptions: every exemption code needs its reason text and a type that allows it (ISTISNA codes
  on `ISTISNA`, 8xx on `OZELMATRAH`, 7xx on `IHRACKAYITLI`, each also on `IADE` and `SGK`); a zero
  VAT needs an exemption outside `IADE`, `IHRACKAYITLI`, `OZELMATRAH`, `SGK`, `KONAKLAMAVERGISI`;
  555 (demirbaş KDV) only on a taxed `TEMELFATURA`, `TICARIFATURA` or `EARSIVFATURA` sale.
- A `KAMU` invoice is paid to a Turkish IBAN written without spaces.
- An export line has its delivery terms, delivery address and transport mode (on the line or the
  invoice) and its GTİP number.
- What each special profile and type needs (see "Special profiles and types").
- The rules GİB writes in its guides rather than the schematron: KWH on a charging line, the
  medicine and medical device code formats, a public invoice's account currency and spending unit,
  an export and a tax-free sale as ISTISNA to the customs authority with exemption 301 or 501, and
  SGK's invoice group, provider, file number and period.
- The profile and the invoice type, as GİB's e-Fatura schematron pairs them
  (`INVOICE_TYPE_PROFILE_IDS`, `PROFILE_INVOICE_TYPE_CODES`): an `IADE` only under `TEMELFATURA`,
  `EARSIVFATURA`, `ILAC_TIBBICIHAZ`, `YATIRIMTESVIK`, `IDIS` or `KAMU` (so a return of a
  `TICARIFATURA` invoice is issued as `TEMELFATURA`), `TEKNOLOJIDESTEK` only under `EARSIVFATURA`,
  `SARJ`/`SARJANLIK` only under `ENERJI` or `EARSIVFATURA`, and `ENERJI`, `ILAC_TIBBICIHAZ`,
  `YATIRIMTESVIK`, `IDIS` only with their own types. Codes the schematron does not pair are left
  alone.
- The buyer of an export or a tax-free sale (see "Export and tax-free buyers"); a buyer under any
  other profile needs a VKN/TCKN or another identification.
- Supplier/customer VKN/TCKN: 10 or 11 digits with matching check digits (`isValidTaxId`). GİB's
  placeholders `11111111111` (final consumer) and `2222222222` (foreign buyer) are accepted.
- No string holds a character XML 1.0 cannot carry (a C0 control other than tab, line feed and
  carriage return, often from pasted text); the issue names the field.
- Supplier/customer title, tax office, city, and country.
- At least one invoice line, and every input the calculator needs (quantity above zero,
  non-negative price, discounts and surcharges, a discount no larger than its line).
- Every amount you supplied, against `calculateInvoice`, exactly.
- Withholding lines: a GİB tevkifat code from `WITHHOLDING_TAX_CODES` with GİB's rate for it
  (606 is 9/10, 801-825 are 10/10), the withheld amount, and an invoice type that allows
  withholding (`TEVKIFAT`, `IADE`, `SGK`, ...; see `WITHHOLDING_INVOICE_TYPE_CODES`). A
  `TEVKIFAT` invoice without withholding lines is accepted, as GİB's schematron accepts it.
- Return types (`RETURN_INVOICE_TYPE_CODES`: `IADE`, `TEVKIFATIADE`, `YTBIADE`,
  `YTBTEVKIFATIADE`): at least one returned invoice, each with its 16-character number
  (`billingReferences`; the deprecated `billingReferenceInvoiceNo` is merged in).
  There is no tolerance: a net-priced line's VAT other than `round(net × rate)` is rejected, and
  a VAT-inclusive line's VAT is the one inside its amount. A fixed total net-priced lines miss is
  closed with `payableRoundingAmount`, never with a line's VAT.

There is no check of a rate group's VAT against `round(Σ net × rate)`. GİB's subtotals are the sum
of the line VAT, and a line-by-line invoice (`40.15` and `160.45` at 10% give `4.02 + 16.05 =
20.07`, the group rounded gives `20.06`) is accepted by GİB's schematron; such a check would
reject it.

Use this in forms, APIs, and tests where you want to display all problems at once.

Options:

```ts
type UblValidationOptions = {
  rounding?: 'line' | 'document'; // default: 'line'
  providerAssignedInvoiceNo?: boolean; // default: false, see "Provider-assigned invoice numbers"
};
```

### `assertValidUblInvoiceInput(input, options?)`

Validates an input and throws `UblValidationError` if invalid.

```ts
assertValidUblInvoiceInput(ublInput);
```

Use it in service code where invalid invoice data should stop the flow immediately.

```ts
try {
  assertValidUblInvoiceInput(ublInput);
} catch (error) {
  if (error instanceof UblValidationError) {
    console.log(error.issues);
  }
}
```

### `isValidVkn`, `isValidTckn`, `isValidTaxId`

Check digits of a Turkish tax identifier. `isValidVkn` takes the 10-digit VKN of a legal entity,
`isValidTckn` the 11-digit TCKN of a person, and `isValidTaxId` either one or one of GİB's
placeholders (`FINAL_CONSUMER_TCKN`, `FOREIGN_BUYER_VKN`).

```ts
isValidTaxId('1234567890'); // true
isValidTaxId('1111111111'); // false: a mistyped number
```

### `UblValidationError`

Error class thrown by `assertValidUblInvoiceInput`.

```ts
class UblValidationError extends Error {
  readonly issues: UblValidationIssue[];
}
```

Use `error.issues` to show exact field-level errors.

### `InvoiceParser`

Parses existing UBL-TR XML into a simpler typed structure.

```ts
const parser = new InvoiceParser();
const parsed = parser.parse(xmlContent);

console.log(parsed.id);
console.log(parsed.supplier.taxId);
console.log(parsed.customer.name);
console.log(parsed.totals.payableAmount);
```

It extracts:

- Invoice id, UUID, issue date, profile, type, currency.
- Document notes (`notes`: every `cbc:Note`, in order, empty ones left out).
- Billing references (`billingReferences`: invoice number, date, document type of each), as a return
  refers to the invoices it returns.
- Payment means (`paymentMeans`: code, due date, IBAN without spaces, account currency, payment
  note, bank and branch).
- Supplier/customer name, VKN/TCKN, tax office, address.
- Monetary totals (line extension, tax exclusive and inclusive, allowance total, payable), tax
  subtotals, and the document withholding total and subtotals.
- Invoice lines, names, notes (`notes`), quantities, unit codes, prices, amounts, and taxes; each line's allowances and
  charges (`discount`, `surchargeAmount`, `allowanceCharges`) and its withholding
  (`withholdings`: code, percent, withheld amount, VAT it was taken from).

The parser preserves VKN/TCKN leading zeroes.

A document with a DOCTYPE or an ENTITY declaration is not parsed: `parse` throws `UblParseError`
(`reason: 'doctype-not-allowed'`). UBL-TR invoices carry neither, and a declared entity can expand
without bound (billion laughs) or point outside the document. The built-in escapes (`&amp;`, `&lt;`)
are still read.

Use it for:

- Reading UBL XML downloaded from a provider.
- Importing or reconciling e-invoices.
- Smoke-testing generated XML by building and parsing it back.

## Main Types

### `UblInvoiceInput`

The canonical input DTO. Your application maps its invoice model into this shape.

Important fields:

```ts
type UblInvoiceInput = {
  invoiceNo: string;
  uuid?: string;
  issueDate: Date;
  issueTime?: string;
  invoiceTypeCode: string;
  profileId: string;
  currency?: string;
  notes?: string[];

  // Optional checks: computed by calculateInvoice, must equal it when given.
  taxExclusiveAmount?: number;
  taxAmount?: number; // VAT after withholding
  discount?: number;
  payableAmount?: number;
  headerAllowanceCharges?: UblDocumentAllowanceCharge[]; // spread over the lines

  supplier: UblParty;
  customer: UblParty;
  lines: UblInvoiceLine[];
};
```

Common `profileId` values:

- `TEMELFATURA`
- `TICARIFATURA`
- `EARSIVFATURA`
- `IHRACAT`
- `YOLCUBERABER`
- `KAMU`

Common `invoiceTypeCode` values:

- `SATIS`
- `IADE`
- `ISTISNA`
- `TEVKIFAT`
- `OZELMATRAH`
- `IHRACKAYITLI`
- `SGK`

Validation checks these fields against GİB's lists (`GIB_EFATURA_PROFILE_IDS`, `GIB_EARCHIVE_PROFILE_IDS`, `GIB_INVOICE_TYPE_CODES`). When GİB publishes a new package, `scripts/generate-gib-codelists.mjs` regenerates them.

### `UblInvoiceLine`

One invoice line.

```ts
type UblInvoiceLine = UblCalcLine & {
  name: string;
  unitCode?: string; // default: NIU
  discountReason?: string;
  surchargeReason?: string;
  // Optional checks, computed by calculateInvoice; each must equal it when given:
  lineAmount?: number; // quantity * price - discount + surchargeAmount
  taxAmount?: number; // VAT before withholding
  withholdingTaxRate?: number; // GİB's rate for withholdingTaxCode (90 for 9/10)
  withholdingTaxAmount?: number; // round(taxAmount * rate / 100), half away from zero
};
```

Example with discount (the net, 900, and VAT, 180, are calculated):

```ts
const line = {
  name: 'Consulting',
  quantity: 2,
  price: 500,
  discount: 100, // or discountRate: 10
  vatRate: 20,
};
```

Example with VAT exemption:

```ts
const line = {
  name: 'Exempt service',
  quantity: 1,
  price: 1000,
  vatRate: 0,
  taxExemptionReasonCode: '301',
  taxExemptionReason: '11/1-a Mal ihracati',
};
```

Example with a surcharge (artırım), net 1100:

```ts
const line = {
  name: 'Consulting',
  quantity: 1,
  price: 1000,
  surchargeRate: 10, // or surchargeAmount: 100
  vatRate: 20,
};
```

Example with withholding VAT (the invoice type must allow it, e.g. `TEVKIFAT`):

```ts
const line = {
  name: 'Withholding service',
  quantity: 1,
  price: 1000,
  vatRate: 20,
  withholdingTaxCode: '606', // 9/10 of the VAT: 180 withheld, 1020 payable
};
```

The line gets its own `WithholdingTaxTotal`, the document one per code and rate. As in GİB's
`TEVKIFAT.xml`, `TaxTotal/TaxAmount` is the VAT left after withholding, `TaxInclusiveAmount` holds
the full VAT and `PayableAmount` is `TaxInclusiveAmount` minus the withholding.

### `UblParty`

Supplier, customer, buyer, carrier, or related party.

```ts
type UblParty = {
  vkn: string; // 10-digit VKN or 11-digit TCKN; '' for a foreign buyer
  title: string;
  taxOffice?: string;
  address?: UblAddress;
  contact?: UblContact;
  person?: UblPerson; // for TCKN real-person invoices
  legalEntity?: UblLegalEntity;
  additionalIds?: UblPartyIdentification[];
};
```

For companies, use `title`.

```ts
const company = {
  vkn: '1234567890',
  title: 'Supplier A.S.',
  taxOffice: 'Istanbul',
  address: { city: 'Istanbul', country: 'Turkiye' },
};
```

For real persons, provide `person` too.

```ts
const person = {
  vkn: '11111111111',
  title: 'Eren Yuksell',
  taxOffice: 'Istanbul',
  person: {
    firstName: 'Eren',
    familyName: 'Yuksell',
  },
  address: { city: 'Istanbul', country: 'Turkiye' },
};
```

#### Export and tax-free buyers

An export (`IHRACAT`) and a tax-free sale to a tourist (`YOLCUBERABERFATURA`) are addressed to the
customs authority (`customer`, VKN `1460415308`); the foreign buyer goes in `buyerCustomer`, without a
VKN or tax office. The builder writes the party type GİB asks for (`PARTYTYPE` `EXPORT` or `TAXFREE`,
see `BUYER_PARTY_TYPES`), and validation checks what GİB's schematron requires of each:

- `IHRACAT`: the buyer's official name in `legalEntity.registrationName`.
- `YOLCUBERABERFATURA`: the tourist's `person` with `firstName`, `familyName`, `nationalityId` (a code
  from `COUNTRY_CODES`) and `passport` (`id`, `issueDate`), and the intermediary in
  `taxRepresentative` (`vkn`, GİB `alias`, `address`).

```ts
const exportInvoice = {
  profileId: 'IHRACAT',
  invoiceTypeCode: 'ISTISNA',
  customer: customsAuthority,
  buyerCustomer: {
    vkn: '',
    title: 'Farthing Purchasing Consortium',
    address: { city: 'Bridgtow', country: 'Great Britain' },
    legalEntity: { registrationName: 'Farthing Purchasing Consortium', companyId: '175 269 2355' },
  },
  // ...
};
```

An export line also needs its delivery terms, delivery address and transport mode (on the line or
on the invoice) and its GTİP (`delivery.shipment.goodsItems[0].requiredCustomsId`).

#### Special profiles and types

| Profile or type                                 | What it needs                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HKS`                                           | every line a 19-character künye number: `additionalItemIds: [{ schemeID: 'KUNYENO', value }]`                                                                                                                                                                                    |
| `ILAC_TIBBICIHAZ`                               | every line an item code in `additionalItemIds`: `ILAC` `(GTIN)…(BN)…(SN)…(XD)YYMMDD`, `TIBBICIHAZ` `(UNO)…(LNO)…[(SNO)…](URT)YYMMDD`, or `DIGER` `1111111111` for an item outside İTS and ÜTS                                                                                    |
| `TEKNOLOJIDESTEK` (e-Arşiv)                     | a TCKN customer; every line a `TELEFON` or `TABLET_PC` identification (IMEI)                                                                                                                                                                                                     |
| `IDIS`                                          | the supplier's `SEVKIYATNO` (`SE-0000000`) in `additionalIds`; every line an `ETIKETNO` (two letters, seven digits)                                                                                                                                                              |
| `SARJ`, `SARJANLIK` (`ENERJI` or e-Arşiv)       | lines in `KWH`; one `PLAKA` in the customer's `additionalIds`; `invoicePeriodStart`/`End` with `invoicePeriodStartTime`/`EndTime`; `SARJ` an ESU report (`additionalDocumentReferences` with `schemeId: 'ESURaporID'`); `SARJANLIK` the charger serial (`itemInstance.serialId`) |
| `YATIRIMTESVIK`, e-Arşiv `YTB*`                 | `investmentIncentive` (six-digit YTBNO and date); every line its expense type (`classificationCode` 01-04) and VAT; expense type 01 the machine (`modelName`, `itemInstance.productTraceId`, `itemInstance.serialId`)                                                            |
| `IHRACKAYITLI` with 702                         | every line its 12-digit GTİP and the buyer's customs line code: a `customsDeclarations` issuer with `ALICIDIBSATIRKOD`                                                                                                                                                           |
| `YATIRIMTESVIK` `ISTISNA`, e-Arşiv `YTBISTISNA` | as above, expense type 01 with exemption 308 or 02 with 339; the VAT is waived (vazgeçilen KDV): shown with `CalculationSequenceNumeric` -1, not charged, not in the payable amount                                                                                              |
| `IHRACAT`, `YOLCUBERABERFATURA`                 | type `ISTISNA`, the customs authority (`1460415308`) as customer; export lines no VAT with exemption 301, tax-free lines their VAT with exemption 501                                                                                                                            |
| `KAMU`                                          | a Turkish IBAN with its currency (`paymentMeans.financialAccount`), the paying spending unit as `buyerCustomer` (10-digit VKN)                                                                                                                                                   |
| `SGK`                                           | `sgk.group` (`SGK_INVOICE_GROUPS`, written as `AccountingCost`); health groups the provider's SGK code and name, the file number and the period; `ABONELIK` the subscriber number and period; `MAL_HIZMET` the expense reference                                                 |
| ÖKC receipt (e-Arşiv)                           | `okcReceipts`: number, date, description (`DOCUMENT_DESCRIPTIONS`), URI and the register (`issuer.endpointId`)                                                                                                                                                                   |

### `UblAddress`

Postal address fields used by UBL-TR.

```ts
type UblAddress = {
  street?: string;
  buildingName?: string;
  buildingNumber?: string;
  room?: string;
  district?: string;
  city?: string;
  postalZone?: string;
  country?: string;
};
```

Validation currently requires `city` and `country` for supplier/customer addresses.

### Payment Types

```ts
type UblPaymentMeans = {
  code: string;
  dueDate?: Date;
  financialAccount?: {
    iban: string;
    currencyCode?: string;
    paymentNote?: string;
    bankName?: string;
    branchName?: string;
  };
};
```

Example:

```ts
const input = {
  ...baseInput,
  paymentMeans: {
    code: '42',
    dueDate: new Date('2026-06-25'),
    financialAccount: {
      iban: 'TR000000000000000000000000',
      bankName: 'Example Bank',
    },
  },
};
```

### Delivery And Shipment Types

Used mostly for export and delivery-heavy invoices.

```ts
const input = {
  ...baseInput,
  delivery: {
    actualDeliveryDate: new Date('2026-05-26'),
    deliveryTerms: 'FOB',
    shipment: {
      grossWeight: 100,
      netWeight: 95,
      weightUnit: 'KGM',
      transportModeCode: '1',
      goodsItems: [
        {
          description: 'Export goods',
          quantity: 10,
          unitCode: 'NIU',
          requiredCustomsId: '123456789012',
        },
      ],
    },
  },
};
```

### e-Arsiv Types

```ts
const input = {
  ...baseInput,
  profileId: 'EARSIVFATURA',
  eArchiveInfo: {
    deliveryType: 'Electronic',
    internetSalesInfo: {
      webAddress: 'https://example.com',
      paymentMediatorName: 'Example PSP',
      paymentType: 'KREDIKARTI',
      paymentDate: '2026-05-25',
    },
  },
};
```

## Common Usage Patterns

### 1. Map Your CRM Invoice To `UblInvoiceInput`

```ts
import { type UblInvoiceInput } from '@erennyuksell/ubl-tr';

// Map the business inputs; the amounts come from calculateInvoice.
function mapInvoiceToUblInput(invoice: CrmInvoice): UblInvoiceInput {
  const lines = invoice.items.map((item) => ({
    name: item.description,
    quantity: item.quantity,
    unitCode: item.unitCode ?? 'NIU',
    price: item.unitPrice,
    discount: item.discountAmount ?? 0,
    vatRate: item.vatRate,
    withholdingTaxCode: item.tevkifatCode,
  }));

  return {
    invoiceNo: invoice.number,
    issueDate: invoice.issueDate,
    profileId: invoice.profile,
    invoiceTypeCode: invoice.type,
    currency: invoice.currency ?? 'TRY',
    supplier: {
      vkn: invoice.seller.taxId,
      title: invoice.seller.title,
      taxOffice: invoice.seller.taxOffice,
      address: invoice.seller.address,
    },
    customer: {
      vkn: invoice.buyer.taxId,
      title: invoice.buyer.title,
      taxOffice: invoice.buyer.taxOffice,
      address: invoice.buyer.address,
    },
    lines,
  };
}
```

### 2. Build XML For A Provider

```ts
const input = mapInvoiceToUblInput(invoice);
const xml = buildUblInvoiceXml(input);

await provider.sendInvoice({ xml });
```

The provider send step is intentionally outside this package.

### 3. Build Object First, Then Serialize

```ts
const document = buildUblInvoice(input);

expect(document.ProfileID).toBe('TEMELFATURA');
expect(document.InvoiceLine).toHaveLength(input.lines.length);

const xml = toUblXml(document);
```

### 4. Validate Before Sending

```ts
const result = validateUblInvoiceInput(input);

if (!result.valid) {
  throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
}

const xml = buildUblInvoiceXml(input);
```

### 5. Parse Incoming XML

```ts
const parser = new InvoiceParser();
const parsed = parser.parse(xmlFromProvider);

console.log(parsed.id);
console.log(parsed.supplier.taxId);
console.log(parsed.totals.payableAmount);
```

## Constants

```ts
import {
  DEFAULT_UNIT_CODE,
  DEFAULT_TAX_TYPE_CODE,
  DEFAULT_TAX_TYPE_NAME,
  TAX_CODE_NAMES,
  WITHHOLDING_TAX_CODES,
  WITHHOLDING_INVOICE_TYPE_CODES,
  RETURN_INVOICE_TYPE_CODES,
} from '@erennyuksell/ubl-tr';
```

Exports:

- `DEFAULT_UNIT_CODE`: `NIU`
- `DEFAULT_TAX_TYPE_CODE`: `0015`
- `DEFAULT_TAX_TYPE_NAME`: `KDV`
- `TAX_CODE_NAMES`: common GIB tax code/name map
- `WITHHOLDING_TAX_CODES`: GİB KDV tevkifat codes with their name and fixed rate, 601-627
  (partial) and 801-825 (full, 10/10). Checked against the schematron of Uyumsoft's test
  environment; 650 is left out because that schematron rejects it.
- `WITHHOLDING_INVOICE_TYPE_CODES`: invoice types that may carry withholding.
- `RETURN_INVOICE_TYPE_CODES`: return types, which need a `BillingReference`.
- `WITHHOLDING_TAX_TYPE_CODE`: `9015`, deprecated and no longer written.

## Money Helpers

The rounding validation uses, for callers that want to compute amounts the same way:

```ts
import { roundMoney, roundTo, toMinor, fromMinor, sumInMinor } from '@erennyuksell/ubl-tr';

roundMoney(2.135); // 2.14, half away from zero, never -0
roundTo(27.7777777777, 8); // 27.77777778
toMinor(16.755); // 1676 (kuruş)
fromMinor(1676); // 16.76
sumInMinor([0.1, 0.2]); // 30, added in kuruş
```

Example:

```ts
const taxName = TAX_CODE_NAMES['0015']; // KDV
```

## Validation Notes

The package validates structural consistency. It is not a full replacement for GIB's latest XSD, Schematron, or provider-side validation.

Validation is intentionally conservative:

- VKN must be 10 digits and TCKN 11, each with matching check digits.
- No text may hold a control character XML does not allow.
- Supplier/customer title, tax office, city, and country are required.
- Every supplied amount must equal `calculateInvoice` to the kuruş; `payableRoundingAmount` is at
  most one kuruş per line.
- Withholding needs a known tevkifat code at GİB's rate for it, and an invoice type that allows it.
- Return invoices need the returned invoice's 16-character number.
- The profile and the invoice type must be a pair GİB's schematron allows.

For production, validate generated XML against the current official GIB requirements and your private integrator's rules.

## ESM And CommonJS

This package ships both ESM and CommonJS builds.

```ts
import { buildUblInvoiceXml } from '@erennyuksell/ubl-tr';
```

```js
const { buildUblInvoiceXml } = require('@erennyuksell/ubl-tr');
```

Both entry points, `@erennyuksell/ubl-tr` and `@erennyuksell/ubl-tr/calc`, ship both formats.

## Development

```bash
npm install
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Two tests check the built XML of one invoice of each kind ubl-tr builds (`test/fixtures/invoice-variants.ts`)
against GİB's own files, kept in `test/gib` (not in the npm package): `test/xsd-validation.test.ts` against
the UBL-TR 1.2.1 schema with `xmllint`, and `test/schematron.test.ts` against GİB's whole e-Fatura
schematron (all 299 rules) with Saxon-HE and SchXslt (Java needed). Fetch the schematron tools once:

```bash
./scripts/fetch-schematron-tools.sh
```

Without `xmllint`, Java or the tools the two tests are skipped locally; on CI (`CI` set) they fail, and
both workflows install the tools, so CI never passes without them. `UBL_TR_XSD` and `UBL_TR_SCHEMATRON`
point the tests at other copies.

When GİB publishes a new package, replace the folder in `test/gib`, regenerate the code lists and the
coverage table, and classify any new rule the coverage script reports:

```bash
node scripts/generate-gib-codelists.mjs test/gib/efatura-schematron/UBL-TR_Codelist.xml 2026-08-21
node scripts/schematron-coverage.mjs test/gib/efatura-schematron 2026-08-21
```

## Scope And Disclaimer

This is an independent, unofficial open-source package. It is not affiliated with, endorsed by, or maintained by GIB, Uyumsoft, or any private integrator.

Always validate generated documents against current official requirements before production use.

## License

MIT
