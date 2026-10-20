// Writes docs/gib-schematron-coverage.md: every assert of GİB's e-Fatura schematron and where ubl-tr checks it.
//   node scripts/schematron-coverage.mjs /path/to/e-FaturaPaketi/schematron 2026-08-21
// A rule GİB adds later shows up as "unclassified" and the script exits with 1: classify it in STATUS below.
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

const [dir, packageDate] = process.argv.slice(2);
if (!dir || !/^\d{4}-\d{2}-\d{2}$/.test(packageDate ?? '')) {
  console.error(
    'usage: node scripts/schematron-coverage.mjs <schematron folder> <package date YYYY-MM-DD>',
  );
  process.exit(1);
}

const STATUS_TEXT = {
  package: 'ubl-tr validation',
  builder: 'builder writes it; schematron test',
  unsupported: 'refused: ubl-tr cannot write the fields yet',
  signature: 'not ubl-tr: the provider signs',
  envelope: 'not ubl-tr: envelope (zarf)',
  display: 'not ubl-tr: display copy (görüntüleme)',
};

// Status of each invoice rule, by schematron rule id; `id#k` is the k-th assert of that rule.
const STATUS = {
  XadesSignatureCheckForInvoice: 'signature',
  X509DataCheck: 'signature',
  X509SubjectNameCheck: 'signature',
  SignatureMethodCheck: 'signature',
  TransformCountCheck: 'signature',
  UBLVersionIDCheck: 'builder',
  CustomizationIDCheck: 'builder',
  ProfileIDCheck: 'package',
  'ProfileIDCheck#3': 'display',
  'ProfileIDCheck#4': 'builder',
  InvoiceIDCheck: 'package',
  CopyIndicatorCheck: 'builder',
  InvoiceTypeCodeCheck: 'package',
  CurrencyCodeCheck: 'package',
  'CurrencyCodeCheck#5': 'builder',
  UUIDCheck: 'package',
  decimalCheck: 'builder',
  SignatureCountCheck: 'builder',
  SignatureCheck: 'builder',
  SignatoryPartyPartyIdentificationCheck: 'builder',
  PartyIdentificationSchemeIDCheck: 'package',
  PartyIdentificationTCKNVKNCheck: 'package',
  PartyIdentificationPartyNamePersonCheck: 'package',
  PartyIdentificationTEKNOLOJIDESTEKCheck: 'unsupported',
  DocumentSenderCheck: 'envelope',
  DocumentReceiverCheck: 'envelope',
  TaxFreeInvoiceCheck: 'package',
  EnerjiPartyIdentificationPlakaCheck: 'unsupported',
  GeneralWithholdingTaxTotalCheck: 'package',
  WithholdingTaxTotalCheck: 'package',
  TaxExemptionReasonCodeCheck: 'package',
  'TaxExemptionReasonCodeCheck#6': 'unsupported',
  BillingReferenceCheck: 'unsupported',
  IhracatYolcuBeraberCheck: 'package',
  'IhracatYolcuBeraberCheck#1': 'envelope',
  'IhracatYolcuBeraberCheck#2': 'envelope',
  TaxRepresentativePartyCheck: 'package',
  HKSInvioceCheck: 'unsupported',
  IADEInvioceCheck: 'package',
  IlacTibbiCihazInvoiceTypeCodeCheck: 'unsupported',
  YatirimTesvikInvoiceTypeCodeCheck: 'unsupported',
  IdisInvoiceTypeCodeCheck: 'unsupported',
  YatirimTesvikContractDocumentReferenceIDCheck: 'unsupported',
  EnerjiInvoicePeriodCheck: 'unsupported',
  EnerjiESURaporIDCheck: 'unsupported',
  TaxFreeNationalityIDCheck: 'package',
  PassportIDCheck: 'package',
  TaxTypeCheck: 'package',
  TaxExemptionReasonCheck: 'package',
  PaymentMeansCodeCheck: 'package',
  InvoicedQuantityCheck: 'builder',
  PriceAmountCheck: 'builder',
  PackageCheck: 'builder',
  DeliveryCodeCheck: 'package',
  LineDeliveryCheck: 'package',
  PartyVDCheck: 'package',
  OfficelTitleCheck: 'package',
  IdisSevkiyatNoCheck: 'unsupported',
  IdisEtiketNoCheck: 'unsupported',
  IlacTibbiCihazAdditionalItemIdentificationCheck: 'unsupported',
  TeknolojiDestekAdditionalItemIdentificationCheck: 'unsupported',
  IhracKayitliPartyIdentificationIDTypeCheck: 'unsupported',
  EnerjiItemInstanceSerialIDCheck: 'unsupported',
  DemirbasKDVTaxExemptionCheck: 'package',
  KamuFaturaCheck: 'package',
};
const YATIRIM_TESVIK = /^YatirimTesvik/;

/** Document kinds of the schematron patterns other than the invoice. */
const OTHER_DOCUMENTS = {
  document: 'envelope',
  header: 'envelope',
  package: 'envelope',
  applicationresponse: 'application response',
  processuseraccount: 'user account',
  canceluseraccount: 'user account',
  despatchadvice: 'e-İrsaliye',
  receiptadvice: 'e-İrsaliye response',
};

const read = (file) => readFileSync(path.join(dir, file), 'utf8');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  stopNodes: ['*.assert'],
  isArray: (_name, _path, _leaf, isAttribute) => !isAttribute,
});
const schemaOf = (file) => parser.parse(read(file)).schema[0];
const clean = (text) =>
  String(text ?? '')
    .replace(/<[^>]+>/g, '…')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '/')
    .trim();
const assertsOf = (rule) => (rule.assert ?? []).map((a) => clean(a['#text']));

const uses = new Map();
for (const pattern of schemaOf('UBL-TR_Main_Schematron.xml').pattern ?? []) {
  for (const rule of pattern.rule ?? []) {
    for (const extend of rule.extends ?? [])
      uses.set(extend.rule, [...(uses.get(extend.rule) ?? []), pattern.id]);
  }
}

const rows = [];
const unclassified = [];
for (const rules of schemaOf('UBL-TR_Common_Schematron.xml').pattern ?? []) {
  for (const rule of rules.rule ?? []) {
    if (rule.abstract !== 'true') continue;
    const id = rule.id;
    const asserts = assertsOf(rule);
    asserts.forEach((message, index) => {
      const patterns = [...new Set(uses.get(id) ?? [])];
      let status;
      if (!patterns.length) status = 'not ubl-tr: GİB does not run it (rule not used)';
      else if (!patterns.includes('invoice')) {
        status = `not ubl-tr: ${[...new Set(patterns.map((p) => OTHER_DOCUMENTS[p] ?? p))].join(', ')}`;
      } else {
        const key =
          STATUS[`${id}#${index + 1}`] ??
          STATUS[id] ??
          (YATIRIM_TESVIK.test(id) ? 'unsupported' : undefined);
        if (!key) unclassified.push(`${id}#${index + 1}`);
        status = key ? STATUS_TEXT[key] : 'unclassified';
      }
      rows.push({ id: `${id}${asserts.length > 1 ? ` #${index + 1}` : ''}`, status, message });
    });
  }
}
const direct = (schemaOf('UBL-TR_Main_Schematron.xml').pattern ?? []).flatMap((pattern) =>
  (pattern.rule ?? []).flatMap((rule) =>
    assertsOf(rule).map((message) => ({ pattern: pattern.id, message })),
  ),
);
for (const { pattern, message } of direct) {
  rows.push({
    id: '(main)',
    status: `not ubl-tr: ${OTHER_DOCUMENTS[pattern] ?? pattern}`,
    message,
  });
}

const count = (prefix) => rows.filter((row) => row.status.startsWith(prefix)).length;
const out = [
  '# GİB e-Fatura schematron coverage',
  '',
  `Every assert of GİB's e-Fatura schematron (\`UBL-TR_Common_Schematron.xml\`, package of ${packageDate}) and`,
  'where ubl-tr checks it. Generated by `scripts/schematron-coverage.mjs`; `test/schematron.test.ts` runs the',
  'whole schematron on one invoice of each kind ubl-tr builds.',
  '',
  '| Where | Rules |',
  '| --- | --- |',
  `| ubl-tr validation, before building | ${count('ubl-tr validation')} |`,
  `| Builder always writes it right; the schematron test proves it | ${count('builder')} |`,
  `| Refused by validation: needs fields ubl-tr cannot write yet | ${count('refused')} |`,
  `| Not ubl-tr (signature, envelope, other documents, display, unused) | ${count('not ubl-tr')} |`,
  `| Total | ${rows.length} |`,
  '',
  '| # | Rule | Where | GİB message |',
  '| --- | --- | --- | --- |',
  ...rows.map((row, index) => `| ${index + 1} | ${row.id} | ${row.status} | ${row.message} |`),
  '',
];
writeFileSync(new URL('../docs/gib-schematron-coverage.md', import.meta.url), out.join('\n'));
console.log(`${rows.length} rules; ${unclassified.length} unclassified`);
if (unclassified.length) {
  console.error(unclassified.join('\n'));
  process.exit(1);
}
