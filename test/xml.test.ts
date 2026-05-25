import { describe, expect, it } from 'vitest';
import { buildUblInvoice, buildUblInvoiceXml, calculateInvoiceTotals, toUblXml } from '../src';
import type { UblInvoiceInput } from '../src';

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

const input: UblInvoiceInput = {
  invoiceNo: 'ABC2026000000001',
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  issueDate: new Date('2026-05-25T09:00:00+03:00'),
  profileId: 'TEMELFATURA',
  invoiceTypeCode: 'SATIS',
  currency: 'TRY',
  ...calculateInvoiceTotals(lines),
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

describe('XML serialization', () => {
  it('serializes a built invoice document to XML', () => {
    const document = buildUblInvoice(input);
    const xml = toUblXml(document, { pretty: false });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Invoice ');
    expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
    expect(xml).toContain('<UBLVersionID>2.1</UBLVersionID>');
    expect(xml).toContain('<ID>ABC2026000000001</ID>');
    expect(xml).toContain('<TaxAmount currencyID="TRY">200</TaxAmount>');
  });

  it('builds invoice XML directly from input', () => {
    const xml = buildUblInvoiceXml(input, { validate: true });

    expect(xml).toContain('<Invoice ');
    expect(xml).toContain('<ProfileID>TEMELFATURA</ProfileID>');
    expect(xml).toContain('<PayableAmount currencyID="TRY">1200</PayableAmount>');
  });
});
