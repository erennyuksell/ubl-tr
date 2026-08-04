# Changelog

All notable changes to this package will be documented in this file.

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
