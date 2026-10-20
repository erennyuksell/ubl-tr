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
      invoiceTypeCode: 'ISTISNA',
      lines: [
        line({
          taxExemptionReasonCode: '501',
          taxExemptionReason:
            "Türkiye'de İkamet Etmeyenlere KDV Hesaplanarak Yapılan Satışlar (Yolcu Beraberi Eşya)",
        }),
      ],
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
      buyerCustomer: {
        vkn: '1234567890',
        title: 'Harcama Birimi',
        address: { city: 'Ankara', country: 'Türkiye' },
      },
    }),
  ],
  [
    'HKS sale with künye numbers',
    base({
      profileId: 'HKS',
      lines: [
        line({
          name: 'Elma',
          additionalItemIds: [
            { schemeID: 'KUNYENO', value: '1231231231231231123' },
            { schemeID: 'MALSAHIBIADSOYADUNVAN', value: 'Mal Sahibi' },
          ],
        }),
      ],
    }),
  ],
  [
    'charging (SARJ) with plate, period and ESU report',
    base({
      profileId: 'ENERJI',
      invoiceTypeCode: 'SARJ',
      customer: { ...customer, additionalIds: [{ schemeID: 'PLAKA', value: '06GIB06' }] },
      invoicePeriodStart: new Date('2026-05-21T00:00:00Z'),
      invoicePeriodStartTime: '00:00:00',
      invoicePeriodEnd: new Date('2026-05-27T00:00:00Z'),
      invoicePeriodEndTime: '23:59:59',
      additionalDocumentReferences: [
        {
          id: 'B0E502A8-122C-4061-BE02-8133A5788177',
          schemeId: 'ESURaporID',
          issueDate: '2026-05-21',
        },
      ],
      lines: [line({ name: 'AC', unitCode: 'KWH' })],
    }),
  ],
  [
    'charging session (SARJANLIK) with charger serial',
    base({
      profileId: 'ENERJI',
      invoiceTypeCode: 'SARJANLIK',
      customer: { ...customer, additionalIds: [{ schemeID: 'PLAKA', value: '06GIB06' }] },
      invoicePeriodStart: new Date('2026-05-28T00:00:00Z'),
      invoicePeriodStartTime: '06:00:00',
      invoicePeriodEnd: new Date('2026-05-28T00:00:00Z'),
      invoicePeriodEndTime: '07:30:00',
      lines: [line({ name: 'DC', unitCode: 'KWH', itemInstance: { serialId: '45225' } })],
    }),
  ],
  [
    'technology support (TEKNOLOJIDESTEK) phone',
    base({
      profileId: 'EARSIVFATURA',
      invoiceTypeCode: 'TEKNOLOJIDESTEK',
      customer: {
        ...customer,
        vkn: '11111111110',
        title: 'Öğrenci Adı',
        person: { firstName: 'Öğrenci', familyName: 'Adı' },
      },
      eArchiveInfo: { deliveryType: 'Electronic' },
      lines: [
        line({
          name: 'Telefon',
          additionalItemIds: [{ schemeID: 'TELEFON', value: '(IMEI)542420896351314' }],
        }),
      ],
    }),
  ],
  [
    'IDIS with shipment and label numbers',
    base({
      profileId: 'IDIS',
      supplier: { ...supplier, additionalIds: [{ schemeID: 'SEVKIYATNO', value: 'SE-1234567' }] },
      lines: [line({ additionalItemIds: [{ schemeID: 'ETIKETNO', value: 'AB1234567' }] })],
    }),
  ],
  [
    'medicine (ILAC_TIBBICIHAZ) with its code',
    base({
      profileId: 'ILAC_TIBBICIHAZ',
      lines: [
        line({
          name: 'İlaç',
          additionalItemIds: [
            { schemeID: 'ILAC', value: '(GTIN)8680222690047(BN)0714450(SN)9546433(XD)210909' },
          ],
        }),
      ],
    }),
  ],
  [
    'investment incentive machine (YATIRIMTESVIK, expense type 01)',
    base({
      profileId: 'YATIRIMTESVIK',
      investmentIncentive: { no: '123456', issueDate: '2026-01-15' },
      lines: [
        line({
          name: 'CNC tezgâhı',
          classificationCode: '01',
          modelName: 'CNC-500',
          itemInstance: { productTraceId: '1', serialId: 'MK-0001' },
        }),
      ],
    }),
  ],
  [
    'e-Arşiv investment incentive sale (YTBSATIS)',
    base({
      profileId: 'EARSIVFATURA',
      invoiceTypeCode: 'YTBSATIS',
      eArchiveInfo: { deliveryType: 'Electronic' },
      investmentIncentive: { no: '654321', issueDate: '2026-02-01' },
      lines: [line({ classificationCode: '03' })],
    }),
  ],
  [
    'e-Arşiv invoice for an ÖKC receipt',
    base({
      profileId: 'EARSIVFATURA',
      eArchiveInfo: { deliveryType: 'Electronic' },
      okcReceipts: [
        {
          id: '0001',
          issueDate: '2026-05-25',
          description: 'FATURA',
          uri: 'https://ornek.com.tr/fis/0001',
          issuer: { ...supplier, endpointId: 'AB12345678' },
        },
      ],
    }),
  ],
  [
    'registered export (IHRACKAYITLI, 702) with GTİP and customs line code',
    base({
      invoiceTypeCode: 'IHRACKAYITLI',
      lines: [
        line({
          vatRate: 0,
          taxAmount: 0,
          taxExemptionReasonCode: '702',
          taxExemptionReason: 'İhraç kaydıyla teslim',
          delivery: {
            shipment: {
              goodsItems: [{ requiredCustomsId: '847130000000' }],
              transportHandlingUnits: [
                {
                  customsDeclarations: [
                    {
                      id: '1',
                      issuer: {
                        vkn: '',
                        title: '',
                        address,
                        additionalIds: [{ schemeID: 'ALICIDIBSATIRKOD', value: '12345678901' }],
                      },
                    },
                  ],
                },
              ],
            },
          },
        }),
      ],
    }),
  ],
  [
    'investment incentive exemption (YATIRIMTESVIK ISTISNA, waived VAT)',
    base({
      profileId: 'YATIRIMTESVIK',
      invoiceTypeCode: 'ISTISNA',
      investmentIncentive: { no: '123456', issueDate: '2026-01-01' },
      lines: [
        line({
          name: 'Ürün adı',
          quantity: 15,
          price: 100,
          lineAmount: 1500,
          taxAmount: 0,
          classificationCode: '01',
          modelName: 'Makine Adı',
          itemInstance: { productTraceId: '74563', serialId: '412578' },
          taxExemptionReasonCode: '308',
          taxExemptionReason: '13/d Teşvikli Yatırım Mallarının Teslimi',
        }),
      ],
    }),
  ],
  [
    'e-Arşiv investment incentive exemption (YTBISTISNA, construction)',
    base({
      profileId: 'EARSIVFATURA',
      invoiceTypeCode: 'YTBISTISNA',
      eArchiveInfo: { deliveryType: 'Electronic' },
      investmentIncentive: { no: '654321', issueDate: '2026-02-01' },
      lines: [
        line({
          taxAmount: 0,
          classificationCode: '02',
          taxExemptionReasonCode: '339',
          taxExemptionReason:
            'İmalat Sanayi ile Turizme Yönelik Yatırım Teşvik Belgesi Kapsamındaki İnşaat İşlerine İlişkin Teslim ve Hizmetler',
        }),
      ],
    }),
  ],
  [
    'SGK pharmacy invoice with group, provider, file number and period',
    base({
      invoiceTypeCode: 'SGK',
      customer: {
        vkn: '7750409379',
        title: 'Sosyal Güvenlik Kurumu Başkanlığı',
        taxOffice: 'Çankaya',
        address: { city: 'Ankara', country: 'Türkiye' },
      },
      sgk: {
        group: 'SAGLIK_ECZ',
        providerCode: '15425689',
        providerName: 'Deneme Eczanesi',
        fileNo: '798564',
      },
      invoicePeriodStart: new Date('2026-05-01T00:00:00Z'),
      invoicePeriodEnd: new Date('2026-05-31T00:00:00Z'),
    }),
  ],
];
