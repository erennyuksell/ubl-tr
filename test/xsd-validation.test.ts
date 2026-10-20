import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildUblInvoiceXml } from '../src';
import type { UblInvoiceInput, UblInvoiceLine } from '../src';

// Checks the XML against GİB's own UBL-TR 1.2.1 schema. The schema is not shipped with the package: point
// UBL_TR_XSD at `xsdrt/maindoc/UBL-Invoice-2.1.xsd` of GİB's UBL-TR package to run it (xmllint is needed too).
const SCHEMA = process.env.UBL_TR_XSD ?? '';
const HAS_XMLLINT = (() => {
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const CAN_RUN = HAS_XMLLINT && SCHEMA !== '' && existsSync(SCHEMA);

const workDir = CAN_RUN ? mkdtempSync(path.join(tmpdir(), 'ubl-tr-xsd-')) : '';
afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

/** xmllint's complaints, '' when the document is valid. The empty signature slot gets a stand-in, as signing fills it. */
function schemaErrors(xml: string, name: string): string {
  const file = path.join(workDir, `${name}.xml`);
  writeFileSync(
    file,
    xml.replace(
      '<ext:ExtensionContent></ext:ExtensionContent>',
      '<ext:ExtensionContent><s xmlns="urn:signature-slot"/></ext:ExtensionContent>',
    ),
  );
  try {
    execFileSync('xmllint', ['--noout', '--schema', SCHEMA, file], { stdio: 'pipe' });
    return '';
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr ?? error);
  }
}

const address = { street: 'Atatürk Cd. 1', district: 'Menteşe', city: 'Muğla', country: 'Türkiye' };
const supplier = { vkn: '1234567890', title: 'Satıcı A.Ş.', taxOffice: 'Muğla', address };
const customer = { vkn: '1111111114', title: 'Alıcı Ltd.', taxOffice: 'Muğla', address };
const line = (extra: Partial<UblInvoiceLine> = {}): UblInvoiceLine => ({
  name: 'Yapı denetim hizmeti',
  quantity: 1,
  price: 1000,
  lineAmount: 1000,
  vatRate: 20,
  taxAmount: 200,
  ...extra,
});
const base = (extra: Partial<UblInvoiceInput> = {}): UblInvoiceInput => ({
  invoiceNo: 'ABC2026000000001',
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  issueDate: new Date('2026-05-25T09:00:00+03:00'),
  issueTime: '09:00:00',
  invoiceTypeCode: 'SATIS',
  profileId: 'TEMELFATURA',
  supplier,
  customer,
  lines: [line()],
  ...extra,
});

const customsAuthority = {
  vkn: '1460415308',
  title: 'Gümrük ve Ticaret Bakanlığı Gümrükler Genel Müdürlüğü Bilgi İşlem Dairesi Başkanlığı',
  taxOffice: 'Ulus',
  address: { city: 'Ankara', country: 'Türkiye' },
};

const VARIANTS: Array<[string, UblInvoiceInput]> = [
  ['plain sale', base()],
  [
    'commercial with a line note and a discount',
    base({
      profileId: 'TICARIFATURA',
      notes: ['YİBF NO: 2049012'],
      lines: [
        line({
          note: 'Satır notu',
          discount: 100,
          discountReason: 'İskonto',
          lineAmount: 900,
          taxAmount: 180,
        }),
      ],
    }),
  ],
  [
    'withholding',
    base({
      profileId: 'TICARIFATURA',
      invoiceTypeCode: 'TEVKIFAT',
      lines: [
        line({ withholdingTaxCode: '608', withholdingTaxRate: 90, withholdingTaxAmount: 180 }),
      ],
    }),
  ],
  [
    'return of two invoices',
    base({
      invoiceTypeCode: 'IADE',
      billingReferences: [
        { invoiceNo: 'ABC2026000000009', issueDate: '2026-05-01' },
        { invoiceNo: 'ABC2026000000010' },
      ],
    }),
  ],
  [
    'exemption',
    base({
      invoiceTypeCode: 'ISTISNA',
      lines: [
        line({
          vatRate: 0,
          taxAmount: 0,
          taxExemptionReasonCode: '351',
          taxExemptionReason: 'Diğerleri',
        }),
      ],
    }),
  ],
  [
    'payment to an IBAN with a due date',
    base({
      dueDate: new Date('2026-06-25T00:00:00+03:00'),
      paymentMeans: {
        code: '42',
        dueDate: new Date('2026-06-25T00:00:00+03:00'),
        financialAccount: {
          iban: 'TR330006100519786457841326',
          currencyCode: 'TRY',
          bankName: 'Örnek Bankası',
          branchName: 'Muğla',
        },
      },
    }),
  ],
  ['foreign currency', base({ currency: 'USD', exchangeRate: 32.5, pricingCurrencyCode: 'USD' })],
  [
    'export to a foreign buyer',
    base({
      profileId: 'IHRACAT',
      invoiceTypeCode: 'ISTISNA',
      currency: 'USD',
      exchangeRate: 32.5,
      customer: customsAuthority,
      buyerCustomer: {
        vkn: '',
        title: 'Farthing Purchasing Consortium',
        address: { city: 'Bridgtow', country: 'Great Britain' },
        legalEntity: {
          registrationName: 'Farthing Purchasing Consortium',
          companyId: '175 269 2355',
        },
      },
      lines: [
        line({
          vatRate: 0,
          taxAmount: 0,
          taxExemptionReasonCode: '301',
          taxExemptionReason: '11/1-a Mal ihracatı',
        }),
      ],
    }),
  ],
  [
    'tax-free sale to a tourist',
    base({
      profileId: 'YOLCUBERABERFATURA',
      customer: customsAuthority,
      buyerCustomer: {
        vkn: '',
        title: '',
        address: { city: 'London', country: 'Great Britain' },
        person: {
          firstName: 'John',
          familyName: 'Doe',
          nationalityId: 'GB',
          passport: { id: 'P1234567', issueDate: '2024-01-14' },
        },
      },
      taxRepresentative: {
        vkn: '1234567890',
        alias: 'urn:mail:yolcuberaberpk@ornek.com.tr',
        address: { city: 'İstanbul', country: 'Türkiye' },
      },
    }),
  ],
  [
    'e-Arşiv internet sale',
    base({
      profileId: 'EARSIVFATURA',
      customer: { ...customer, vkn: '11111111111', title: 'Nihai Tüketici' },
      eArchiveInfo: {
        deliveryType: 'Electronic',
        internetSalesInfo: {
          webAddress: 'https://ornek.com.tr',
          paymentMediatorName: 'Aracı',
          paymentType: 'KREDIKARTI/BANKAKARTI',
          paymentDate: '2026-05-25',
        },
      },
    }),
  ],
];

describe.skipIf(!CAN_RUN)("XML against GİB's UBL-TR 1.2.1 schema", () => {
  for (const [name, input] of VARIANTS) {
    it(`is valid: ${name}`, () => {
      expect(schemaErrors(buildUblInvoiceXml(input), name.replace(/\W+/g, '-'))).toBe('');
    });
  }
});
