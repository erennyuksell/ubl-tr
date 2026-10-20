// Invoices of each kind ubl-tr builds, shared by the GİB schema and schematron tests.
import type { UblInvoiceInput, UblInvoiceLine } from '../../src';

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

/** One invoice of each kind ubl-tr builds, by name. */
export const VARIANTS: Array<[string, UblInvoiceInput]> = [
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
          delivery: {
            deliveryTerms: 'FOB',
            address: { city: 'Bridgtow', country: 'Great Britain' },
            shipment: {
              transportModeCode: '1',
              goodsItems: [{ requiredCustomsId: '847130000000' }],
            },
          },
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
      customer: {
        ...customer,
        vkn: '11111111111',
        title: 'Nihai Tüketici',
        person: { firstName: 'Nihai', familyName: 'Tüketici' },
      },
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
  [
    'public institution paid to an IBAN',
    base({
      profileId: 'KAMU',
      paymentMeans: {
        code: '42',
        financialAccount: { iban: 'TR330006100519786457841326', currencyCode: 'TRY' },
      },
    }),
  ],
];
