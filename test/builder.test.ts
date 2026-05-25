import { describe, expect, it } from 'vitest';
import { buildUblInvoice } from '../src';

describe('buildUblInvoice', () => {
  it('builds the core provider-independent UBL-TR invoice object', () => {
    const invoice = buildUblInvoice({
      invoiceNo: 'ABC2026000000001',
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      issueDate: new Date('2026-05-25T09:00:00+03:00'),
      profileId: 'TEMELFATURA',
      invoiceTypeCode: 'SATIS',
      currency: 'TRY',
      taxExclusiveAmount: 1000,
      taxAmount: 200,
      discount: 0,
      payableAmount: 1200,
      supplier: {
        vkn: '1234567890',
        title: 'Supplier A.S.',
        taxOffice: 'Istanbul',
        address: {
          street: 'Example Street',
          district: 'Kadikoy',
          city: 'Istanbul',
          country: 'Turkiye',
        },
      },
      customer: {
        vkn: '11111111111',
        title: 'Customer Name',
        taxOffice: 'Istanbul',
        address: {
          street: 'Customer Street',
          district: 'Besiktas',
          city: 'Istanbul',
          country: 'Turkiye',
        },
      },
      lines: [
        {
          name: 'Software service',
          quantity: 1,
          unitCode: 'NIU',
          price: 1000,
          lineAmount: 1000,
          vatRate: 20,
          taxAmount: 200,
        },
      ],
    });

    expect(invoice).toMatchObject({
      UBLVersionID: '2.1',
      CustomizationID: 'TR1.2',
      ProfileID: 'TEMELFATURA',
      ID: 'ABC2026000000001',
      AccountingSupplierParty: {
        Party: {
          PartyIdentification: [{ ID: { $attributes: { schemeID: 'VKN' } } }],
        },
      },
      AccountingCustomerParty: {
        Party: {
          PartyIdentification: [{ ID: { $attributes: { schemeID: 'TCKN' } } }],
        },
      },
      TaxTotal: { TaxAmount: { $value: 200 } },
      LegalMonetaryTotal: { PayableAmount: { $value: 1200 } },
    });
    expect(invoice.InvoiceLine).toHaveLength(1);
  });
});
