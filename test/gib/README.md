# GİB files for the conformance tests

Copies of GİB's published technical files, used only by the tests (they are not in the npm package):

- `ubl-tr-1.2.1/xsdrt`: the UBL-TR 1.2.1 schema (`UBL-TR-1.2.1-Paketi`), read by `test/xsd-validation.test.ts`.
- `efatura-schematron`: the `schematron` folder of GİB's e-Fatura package, rules of 2026-08-21
  (`History.txt`, converted to UTF-8), read by `test/schematron.test.ts` and the generators in `scripts/`.

Source: GİB e-Belge, https://ebelge.gib.gov.tr (Teknik Belgeler, e-Fatura Paketi and UBL-TR 1.2.1 Paketi).
When GİB publishes a new package, replace the folder, then run `scripts/generate-gib-codelists.mjs` and
`scripts/schematron-coverage.mjs` with the new date.
