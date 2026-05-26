# @erennyuksell/ubl-tr

TypeScript utilities for building, validating, serializing, and parsing Turkish UBL-TR e-invoice documents.

This package is a provider-independent UBL-TR layer. It helps you convert your own application's invoice data into a standard `UblInvoiceInput`, then into a UBL-TR document object or XML string.

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
  calculateInvoiceTotals,
  toUblXml,
  validateUblInvoiceInput,
} from '@erennyuksell/ubl-tr';
```

## Mental Model

Every application stores invoices differently. One app may have `customerName`, another may have `buyer.legalName`, another may have `CariUnvan`.

This package does not try to understand every possible application model. Your app maps its own invoice model into the package's canonical input DTO:

```ts
YourInvoiceModel -> your mapper -> UblInvoiceInput -> UBL-TR document object -> XML
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

- Converts `UblInvoiceInput` into a GIB UBL-TR invoice document object.
- Serializes UBL-TR document objects into XML.
- Validates required invoice fields, parties, lines, totals, and tax amounts.
- Calculates invoice totals from invoice lines.
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
  calculateInvoiceTotals,
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
    lineAmount: 1000,
    vatRate: 20,
    taxAmount: 200,
  },
];

const totals = calculateInvoiceTotals(lines);

const ublInput: UblInvoiceInput = {
  invoiceNo: appInvoice.number,
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  issueDate: appInvoice.issuedAt,
  profileId: 'TEMELFATURA',
  invoiceTypeCode: 'SATIS',
  currency: 'TRY',
  ...totals,
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

const ublDocument = buildUblInvoice(ublInput);
const xml = buildUblInvoiceXml(ublInput);
```

## Public API

### `buildUblInvoice(input, options?)`

Builds a plain JavaScript object representing a UBL-TR `Invoice` document.

```ts
const document = buildUblInvoice(ublInput);
```

Use it when:

- You want to inspect the generated UBL structure in tests.
- A provider SDK needs an object form before wrapping it.
- You want to call `toUblXml` yourself with custom XML options.

By default it validates the input before building. Disable validation only when you already validated upstream:

```ts
const document = buildUblInvoice(ublInput, { validate: false });
```

Options:

```ts
type UblBuildOptions = {
  validate?: boolean; // default: true
  tolerance?: number; // default: 0.01 for amount comparison
};
```

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

### `calculateInvoiceTotals(lines)`

Calculates invoice-level totals from line data.

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

Rules:

- `taxExclusiveAmount` is the sum of `line.lineAmount`.
- `taxAmount` is the sum of `line.taxAmount - line.withholdingTaxAmount`.
- `discount` is the sum of `line.discount`.
- `payableAmount` is `taxExclusiveAmount + taxAmount`.

Use this when your app has line-level amounts and you want consistent totals before building.

### `validateUblInvoiceInput(input, tolerance?)`

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

It checks:

- Required header fields: `invoiceNo`, `issueDate`, `profileId`, `invoiceTypeCode`.
- Supplier/customer VKN/TCKN format.
- Supplier/customer title, tax office, city, and country.
- At least one invoice line.
- Line quantity, price, VAT rate, line amount, and tax amount.
- Invoice totals against line totals.

Use this in forms, APIs, and tests where you want to display all problems at once.

### `assertValidUblInvoiceInput(input, tolerance?)`

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
- Supplier/customer name, VKN/TCKN, tax office, address.
- Monetary totals and tax subtotals.
- Invoice lines, quantities, unit codes, prices, amounts, and taxes.

The parser preserves VKN/TCKN leading zeroes.

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

  taxExclusiveAmount: number;
  taxAmount: number;
  discount: number;
  payableAmount: number;

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

The package accepts strings for these fields because GIB/provider lists may change. Validate your allowed business values in your own application if needed.

### `UblInvoiceLine`

One invoice line.

```ts
type UblInvoiceLine = {
  name: string;
  quantity: number;
  unitCode?: string; // default: NIU
  price: number;
  discount?: number;
  lineAmount: number;
  vatRate: number;
  taxAmount: number;
  taxTypeCode?: string; // default: 0015
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
  withholdingTaxCode?: string;
  withholdingTaxRate?: number;
  withholdingTaxAmount?: number;
};
```

Example with discount:

```ts
const line = {
  name: 'Consulting',
  quantity: 2,
  price: 500,
  discount: 100,
  lineAmount: 900,
  vatRate: 20,
  taxAmount: 180,
};
```

Example with VAT exemption:

```ts
const line = {
  name: 'Exempt service',
  quantity: 1,
  price: 1000,
  lineAmount: 1000,
  vatRate: 0,
  taxAmount: 0,
  taxExemptionReasonCode: '301',
  taxExemptionReason: '11/1-a Mal ihracati',
};
```

Example with withholding VAT:

```ts
const line = {
  name: 'Withholding service',
  quantity: 1,
  price: 1000,
  lineAmount: 1000,
  vatRate: 20,
  taxAmount: 200,
  withholdingTaxCode: '601',
  withholdingTaxRate: 50,
  withholdingTaxAmount: 100,
};
```

### `UblParty`

Supplier, customer, buyer, carrier, or related party.

```ts
type UblParty = {
  vkn: string; // 10-digit VKN or 11-digit TCKN
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
import { calculateInvoiceTotals, type UblInvoiceInput } from '@erennyuksell/ubl-tr';

function mapInvoiceToUblInput(invoice: CrmInvoice): UblInvoiceInput {
  const lines = invoice.items.map((item) => ({
    name: item.description,
    quantity: item.quantity,
    unitCode: item.unitCode ?? 'NIU',
    price: item.unitPrice,
    discount: item.discountAmount ?? 0,
    lineAmount: item.netAmount,
    vatRate: item.vatRate,
    taxAmount: item.vatAmount,
  }));

  return {
    invoiceNo: invoice.number,
    issueDate: invoice.issueDate,
    profileId: invoice.profile,
    invoiceTypeCode: invoice.type,
    currency: invoice.currency ?? 'TRY',
    ...calculateInvoiceTotals(lines),
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
  WITHHOLDING_TAX_TYPE_CODE,
} from '@erennyuksell/ubl-tr';
```

Exports:

- `DEFAULT_UNIT_CODE`: `NIU`
- `DEFAULT_TAX_TYPE_CODE`: `0015`
- `DEFAULT_TAX_TYPE_NAME`: `KDV`
- `WITHHOLDING_TAX_TYPE_CODE`: `9015`
- `TAX_CODE_NAMES`: common GIB tax code/name map

Example:

```ts
const taxName = TAX_CODE_NAMES['0015']; // KDV
```

## Validation Notes

The package validates structural consistency. It is not a full replacement for GIB's latest XSD, Schematron, or provider-side validation.

Validation is intentionally conservative:

- VKN must be 10 digits.
- TCKN must be 11 digits.
- Supplier/customer title, tax office, city, and country are required.
- Line totals must match `quantity * price - discount + surchargeAmount`.
- Tax totals must match line totals within tolerance.

For production, validate generated XML against the current official GIB requirements and your private integrator's rules.

## ESM And CommonJS

This package ships both ESM and CommonJS builds.

```ts
import { buildUblInvoiceXml } from '@erennyuksell/ubl-tr';
```

```js
const { buildUblInvoiceXml } = require('@erennyuksell/ubl-tr');
```

## Development

```bash
npm install
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

## Scope And Disclaimer

This is an independent, unofficial open-source package. It is not affiliated with, endorsed by, or maintained by GIB, Uyumsoft, or any private integrator.

Always validate generated documents against current official requirements before production use.

## License

MIT
