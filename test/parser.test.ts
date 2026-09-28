import { describe, expect, it } from 'vitest';
import { InvoiceParser, buildUblInvoiceXml, calculateInvoiceTotals } from '../src';
import type { UblInvoiceInput, UblInvoiceLine } from '../src';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TEMELFATURA</cbc:ProfileID>
  <cbc:ID>ABC2026000000001</cbc:ID>
  <cbc:UUID>550e8400-e29b-41d4-a716-446655440000</cbc:UUID>
  <cbc:IssueDate>2026-05-25</cbc:IssueDate>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="VKN">0123456789</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>Supplier A.S.</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Example Street</cbc:StreetName>
        <cbc:CitySubdivisionName>Kadikoy</cbc:CitySubdivisionName>
        <cbc:CityName>Istanbul</cbc:CityName>
        <cac:Country><cbc:Name>Turkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>Istanbul</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="TCKN">11111111111</cbc:ID></cac:PartyIdentification>
      <cac:Person><cbc:FirstName>Eren</cbc:FirstName><cbc:FamilyName>Yuksell</cbc:FamilyName></cac:Person>
      <cac:PostalAddress>
        <cbc:StreetName>Customer Street</cbc:StreetName>
        <cbc:CitySubdivisionName>Besiktas</cbc:CitySubdivisionName>
        <cbc:CityName>Istanbul</cbc:CityName>
        <cac:Country><cbc:Name>Turkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>Istanbul</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">200.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">1000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">200.00</cbc:TaxAmount>
      <cbc:Percent>20</cbc:Percent>
      <cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="TRY">1000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">1200.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="TRY">1200.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="TRY">1000.00</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="TRY">200.00</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="TRY">1000.00</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="TRY">200.00</cbc:TaxAmount>
        <cbc:Percent>20</cbc:Percent>
        <cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item><cbc:Name>Software service</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="TRY">1000.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

describe('InvoiceParser', () => {
  it('parses core UBL-TR invoice fields and preserves tax identifiers', () => {
    const parsed = new InvoiceParser().parse(xml);

    expect(parsed.id).toBe('ABC2026000000001');
    expect(parsed.uuid).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(parsed.profileId).toBe('TEMELFATURA');
    expect(parsed.invoiceTypeCode).toBe('SATIS');
    expect(parsed.supplier.taxId).toBe('0123456789');
    expect(parsed.customer.name).toBe('Eren Yuksell');
    expect(parsed.totals.payableAmount).toBe(1200);
    expect(parsed.totals.taxSubtotals[0]?.taxCode).toBe('0015');
    expect(parsed.lines[0]).toMatchObject({
      id: '1',
      name: 'Software service',
      quantity: 1,
      unitCode: 'NIU',
      price: 1000,
      lineAmount: 1000,
    });
  });
});

describe('InvoiceParser round trip', () => {
  const party = {
    vkn: '1234567890',
    title: 'Supplier A.S.',
    taxOffice: 'Istanbul',
    address: {
      street: 'Example Street',
      district: 'Kadikoy',
      city: 'Istanbul',
      country: 'Turkiye',
    },
  };
  const lines: UblInvoiceLine[] = [
    {
      name: 'İskontolu hizmet',
      quantity: 12,
      price: 825.5,
      discount: 495.3,
      discountReason: 'Kampanya',
      lineAmount: 9410.7,
      vatRate: 20,
      taxAmount: 1882.14,
    },
    {
      name: 'Artırımlı hizmet',
      quantity: 1,
      price: 900,
      surchargeRate: 10,
      surchargeAmount: 90,
      lineAmount: 990,
      vatRate: 20,
      taxAmount: 198,
    },
    {
      name: 'Yapı denetim',
      quantity: 1,
      price: 1234.75,
      lineAmount: 1234.75,
      vatRate: 20,
      taxAmount: 246.95,
      withholdingTaxCode: '608',
      withholdingTaxRate: 90,
      withholdingTaxAmount: 222.26,
    },
  ];
  const input: UblInvoiceInput = {
    invoiceNo: 'ABC2026000000001',
    issueDate: new Date('2026-05-25T09:00:00+03:00'),
    profileId: 'TICARIFATURA',
    invoiceTypeCode: 'TEVKIFAT',
    currency: 'TRY',
    ...calculateInvoiceTotals(lines),
    supplier: party,
    customer: { ...party, vkn: '1111111111', title: 'Customer Ltd.' },
    lines,
  };

  it('reads line discounts, surcharges and withholding back', () => {
    const parsed = new InvoiceParser().parse(buildUblInvoiceXml(input));

    expect(parsed.lines[0]).toMatchObject({
      discount: 495.3,
      surchargeAmount: 0,
      withholdings: [],
    });
    expect(parsed.lines[0]?.allowanceCharges).toEqual([
      {
        isCharge: false,
        reason: 'Kampanya',
        multiplierFactor: 0.05,
        amount: 495.3,
        baseAmount: 9906,
      },
    ]);
    expect(parsed.lines[1]).toMatchObject({ discount: 0, surchargeAmount: 90 });
    expect(parsed.lines[1]?.allowanceCharges[0]).toMatchObject({
      isCharge: true,
      multiplierFactor: 0.1,
    });
    expect(parsed.lines[2]?.withholdings).toEqual([
      { taxableAmount: 246.95, taxAmount: 222.26, percent: 90, taxCode: '608', taxName: '' },
    ]);
    expect(parsed.lines[2]?.taxes[0]).toMatchObject({ taxAmount: 246.95, percent: 20 });
  });

  it('reads the document withholding and monetary totals', () => {
    const parsed = new InvoiceParser().parse(buildUblInvoiceXml(input));

    expect(parsed.totals).toMatchObject({
      lineExtensionAmount: 12130.75,
      taxExclusiveAmount: 11635.45,
      allowanceTotalAmount: 495.3,
      taxInclusiveAmount: 13962.54,
      taxAmount: 2104.83,
      withholdingTaxAmount: 222.26,
      payableAmount: 13740.28,
    });
    expect(parsed.totals.withholdingTaxSubtotals).toEqual([
      { taxableAmount: 246.95, taxAmount: 222.26, percent: 90, taxCode: '608', taxName: '' },
    ]);
  });
});
