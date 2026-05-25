# @erennyuksell/ubl-tr

TypeScript utilities for building and parsing Turkish UBL-TR e-invoice documents.

This package focuses on provider-independent UBL-TR document logic. It does not send invoices, sign XML, call GIB services, or integrate with a private integrator. Use it to build UBL-TR invoice payloads and parse existing UBL-TR XML into typed data.

## Install

```bash
npm install @erennyuksell/ubl-tr
```

## Quick Start

```ts
import {
  InvoiceParser,
  buildUblInvoice,
  buildUblInvoiceXml,
  calculateInvoiceTotals,
} from '@erennyuksell/ubl-tr';

const parser = new InvoiceParser();
const invoice = parser.parse(xmlContent);

const lines = [
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

const ublInput = {
  invoiceNo: 'ABC2026000000001',
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  issueDate: new Date('2026-05-25T09:00:00+03:00'),
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
    title: 'Customer Name',
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

const ubl = buildUblInvoice(ublInput);
const xml = buildUblInvoiceXml(ublInput);
```

## Features

- Build provider-independent UBL-TR invoice objects.
- Build XML strings with `buildUblInvoiceXml` or `toUblXml`.
- Validate required fields and monetary totals before building.
- Calculate invoice totals from line data.
- Parse UBL-TR XML while preserving VKN/TCKN leading zeroes.
- Common GIB tax code constants.
- e-Fatura and e-Arsiv oriented invoice fields.
- TypeScript types for parties, addresses, invoice lines, payment, shipment, and e-archive metadata.
- ESM and CommonJS builds.

## Scope

This package intentionally does not include:

- SOAP clients or private integrator APIs.
- XML digital signature or mali muhur operations.
- GIB portal automation.
- Persistence, file storage, HTTP controllers, or framework-specific adapters.

## Disclaimer

This is an independent, unofficial open-source package. It is not affiliated with, endorsed by, or maintained by GIB, Uyumsoft, or any private integrator. Always validate generated documents against the current official requirements before production use.

## Development

```bash
npm install
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

## License

MIT
