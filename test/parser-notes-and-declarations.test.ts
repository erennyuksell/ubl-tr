import { describe, expect, it } from 'vitest';
import { InvoiceParser, UblParseError } from '../src';

const invoiceWith = (inner: string, prolog = '<?xml version="1.0" encoding="UTF-8"?>') => `${prolog}
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>ABC2026000000001</cbc:ID>
  <cbc:UUID>550e8400-e29b-41d4-a716-446655440000</cbc:UUID>
  ${inner}
</Invoice>`;

describe('InvoiceParser notes', () => {
  it('reads every document note in order and drops empty ones', () => {
    const parsed = new InvoiceParser().parse(
      invoiceWith(`
      <cbc:Note>YİBF NO: 2049012</cbc:Note>
      <cbc:Note>   </cbc:Note>
      <cbc:Note>2 NOLU HAKEDİŞ &amp; PAYLAR</cbc:Note>`),
    );
    expect(parsed.notes).toEqual(['YİBF NO: 2049012', '2 NOLU HAKEDİŞ & PAYLAR']);
  });

  it('reads a single note as a one-item list and no note as an empty list', () => {
    expect(new InvoiceParser().parse(invoiceWith('<cbc:Note>tek not</cbc:Note>')).notes).toEqual([
      'tek not',
    ]);
    expect(new InvoiceParser().parse(invoiceWith('')).notes).toEqual([]);
  });

  it('does not take line notes as document notes', () => {
    const parsed = new InvoiceParser().parse(
      invoiceWith(`
      <cbc:Note>belge notu</cbc:Note>
      <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:Note>satır notu</cbc:Note></cac:InvoiceLine>`),
    );
    expect(parsed.notes).toEqual(['belge notu']);
  });
});

describe('InvoiceParser declarations', () => {
  it('refuses a document with a DOCTYPE', () => {
    const xml = invoiceWith('', '<?xml version="1.0"?><!DOCTYPE Invoice>');
    expect(() => new InvoiceParser().parse(xml)).toThrow(UblParseError);
  });

  it('refuses entity expansion (billion laughs) before parsing', () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]>
<Invoice><cbc:Note>&lol2;</cbc:Note></Invoice>`;
    try {
      new InvoiceParser().parse(xml);
      expect.fail('parsed');
    } catch (error) {
      expect(error).toBeInstanceOf(UblParseError);
      expect((error as UblParseError).reason).toBe('doctype-not-allowed');
    }
  });

  it('refuses an external entity whatever the spacing and case', () => {
    expect(() =>
      new InvoiceParser().parse(
        '<!  doctype x [<!entity e SYSTEM "file:///etc/passwd">]><Invoice/>',
      ),
    ).toThrow(UblParseError);
  });

  it('still reads the built-in XML escapes', () => {
    expect(new InvoiceParser().parse(invoiceWith('<cbc:Note>A &lt; B</cbc:Note>')).notes).toEqual([
      'A < B',
    ]);
  });
});

describe('InvoiceParser references, payment and line notes', () => {
  it('reads every billing reference, the payment account and the line notes', () => {
    const parsed = new InvoiceParser().parse(
      invoiceWith(`
      <cac:BillingReference><cac:InvoiceDocumentReference>
        <cbc:ID>ABC2026000000009</cbc:ID><cbc:IssueDate>2026-05-01</cbc:IssueDate><cbc:DocumentTypeCode>IADE</cbc:DocumentTypeCode>
      </cac:InvoiceDocumentReference></cac:BillingReference>
      <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>ABC2026000000010</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>
      <cac:PaymentMeans>
        <cbc:PaymentMeansCode>42</cbc:PaymentMeansCode><cbc:PaymentDueDate>2026-06-25</cbc:PaymentDueDate>
        <cac:PayeeFinancialAccount>
          <cbc:ID>TR33 0006 1005 1978 6457 8413 26</cbc:ID><cbc:CurrencyCode>TRY</cbc:CurrencyCode>
          <cac:FinancialInstitutionBranch><cbc:Name>Muğla</cbc:Name>
            <cac:FinancialInstitution><cbc:Name>Örnek Bankası</cbc:Name></cac:FinancialInstitution>
          </cac:FinancialInstitutionBranch>
        </cac:PayeeFinancialAccount>
      </cac:PaymentMeans>
      <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:Note>YİBF NO: 2049012</cbc:Note><cbc:Note> </cbc:Note></cac:InvoiceLine>`),
    );
    expect(parsed.billingReferences).toEqual([
      { invoiceNo: 'ABC2026000000009', issueDate: '2026-05-01', documentTypeCode: 'IADE' },
      { invoiceNo: 'ABC2026000000010', issueDate: '', documentTypeCode: '' },
    ]);
    expect(parsed.paymentMeans).toEqual([
      {
        code: '42',
        dueDate: '2026-06-25',
        iban: 'TR330006100519786457841326',
        currencyCode: 'TRY',
        paymentNote: '',
        bankName: 'Örnek Bankası',
        branchName: 'Muğla',
      },
    ]);
    expect(parsed.lines[0]?.notes).toEqual(['YİBF NO: 2049012']);
  });

  it('gives empty lists when the invoice has none of them', () => {
    const parsed = new InvoiceParser().parse(invoiceWith(''));
    expect(parsed.billingReferences).toEqual([]);
    expect(parsed.paymentMeans).toEqual([]);
  });
});
