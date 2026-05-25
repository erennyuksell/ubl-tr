import { XMLParser } from 'fast-xml-parser';

interface ParsedXmlNode {
  [key: string]: unknown;
}

interface ParsedAddress {
  street: string;
  buildingName: string;
  buildingNumber: string;
  room: string;
  citySubdivision: string;
  city: string;
  postalZone: string;
  region: string;
  country: string;
}

interface ParsedTaxSubtotal {
  taxableAmount: number;
  taxAmount: number;
  percent: number;
  taxCode: string;
  taxName: string;
}

export interface InvoiceExtractedData {
  id: string;
  uuid: string;
  issueDate: string;
  invoiceTypeCode: string;
  profileId: string;
  currency: string;
  supplier: {
    name: string;
    taxId: string;
    taxOffice: string;
    address: ParsedAddress;
  };
  customer: {
    name: string;
    taxId: string;
    taxOffice: string;
    address: ParsedAddress;
  };
  totals: {
    taxExclusiveAmount: number;
    taxInclusiveAmount: number;
    payableAmount: number;
    taxAmount: number;
    taxSubtotals: ParsedTaxSubtotal[];
  };
  lines: Array<{
    id: string;
    name: string;
    quantity: number;
    unitCode: string;
    price: number;
    lineAmount: number;
    taxes: ParsedTaxSubtotal[];
  }>;
}

function isNode(value: unknown): value is ParsedXmlNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function child(node: unknown, key: string): unknown {
  return isNode(node) ? node[key] : undefined;
}

function childNode(node: unknown, key: string): ParsedXmlNode | undefined {
  const value = child(node, key);
  return isNode(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): unknown {
  if (isNode(value) && Object.prototype.hasOwnProperty.call(value, '#text')) {
    return value['#text'];
  }
  return value;
}

function safeGetStr(value: unknown): string {
  const raw = textValue(value);
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

function safeGetNum(value: unknown): number {
  const raw = textValue(value);
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function emptyAddress(): ParsedAddress {
  return {
    street: '',
    buildingName: '',
    buildingNumber: '',
    room: '',
    citySubdivision: '',
    city: '',
    postalZone: '',
    region: '',
    country: '',
  };
}

export class InvoiceParser {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true,
      parseAttributeValue: false,
      trimValues: true,
      numberParseOptions: {
        leadingZeros: false,
        hex: false,
        skipLike: /.*/,
      },
      isArray: (name) =>
        ['InvoiceLine', 'TaxSubtotal', 'AllowanceCharge', 'PartyIdentification'].includes(name),
    });
  }

  public parse(xmlContent: string): InvoiceExtractedData {
    const parsed = this.parser.parse(xmlContent) as unknown;
    const root = childNode(parsed, 'Invoice') ?? (isNode(parsed) ? parsed : {});

    return {
      id: safeGetStr(child(root, 'ID')),
      uuid: safeGetStr(child(root, 'UUID')),
      issueDate: safeGetStr(child(root, 'IssueDate')),
      invoiceTypeCode: safeGetStr(child(root, 'InvoiceTypeCode')),
      profileId: safeGetStr(child(root, 'ProfileID')),
      currency: safeGetStr(child(root, 'DocumentCurrencyCode')),

      supplier: this.parseParty(child(childNode(root, 'AccountingSupplierParty'), 'Party')),
      customer: this.parseParty(child(childNode(root, 'AccountingCustomerParty'), 'Party')),

      totals: this.parseTotals(root),
      lines: this.parseLines(child(root, 'InvoiceLine')),
    };
  }

  private parseParty(party: unknown): InvoiceExtractedData['supplier'] {
    if (!isNode(party)) {
      return { name: '', taxId: '', taxOffice: '', address: emptyAddress() };
    }

    let name = '';
    const partyName = childNode(party, 'PartyName');
    const person = childNode(party, 'Person');
    if (partyName) {
      name = safeGetStr(child(partyName, 'Name'));
    } else if (person) {
      const first = safeGetStr(child(person, 'FirstName'));
      const mid = safeGetStr(child(person, 'MiddleName'));
      const family = safeGetStr(child(person, 'FamilyName'));
      name = [first, mid, family].filter(Boolean).join(' ');
    }

    let taxId = '';
    for (const identification of asArray(child(party, 'PartyIdentification'))) {
      const idNode = child(identification, 'ID');
      if (!idNode) continue;
      const scheme = safeGetStr(child(idNode, '@_schemeID'));
      const value = safeGetStr(idNode);
      if (scheme === 'VKN' || scheme === 'TCKN') {
        taxId = value;
        break;
      }
      if (!taxId) taxId = value;
    }

    const address = childNode(party, 'PostalAddress') ?? {};
    const taxScheme = childNode(childNode(party, 'PartyTaxScheme'), 'TaxScheme');

    return {
      name,
      taxId,
      taxOffice: safeGetStr(child(taxScheme, 'Name')),
      address: {
        street: safeGetStr(child(address, 'StreetName')),
        buildingName: safeGetStr(child(address, 'BuildingName')),
        buildingNumber: safeGetStr(child(address, 'BuildingNumber')),
        room: safeGetStr(child(address, 'Room')),
        citySubdivision: safeGetStr(child(address, 'CitySubdivisionName')),
        city: safeGetStr(child(address, 'CityName')),
        postalZone: safeGetStr(child(address, 'PostalZone')),
        region: safeGetStr(child(address, 'Region')),
        country: safeGetStr(child(childNode(address, 'Country'), 'Name')),
      },
    };
  }

  private parseTotals(root: ParsedXmlNode): InvoiceExtractedData['totals'] {
    const monetaryTotal = childNode(root, 'LegalMonetaryTotal') ?? {};
    const taxTotal = childNode(root, 'TaxTotal') ?? {};

    return {
      taxExclusiveAmount: safeGetNum(child(monetaryTotal, 'TaxExclusiveAmount')),
      taxInclusiveAmount: safeGetNum(child(monetaryTotal, 'TaxInclusiveAmount')),
      payableAmount: safeGetNum(child(monetaryTotal, 'PayableAmount')),
      taxAmount: safeGetNum(child(taxTotal, 'TaxAmount')),
      taxSubtotals: this.parseTaxSubtotals(child(taxTotal, 'TaxSubtotal')),
    };
  }

  private parseLines(lines: unknown): InvoiceExtractedData['lines'] {
    return asArray(lines)
      .filter(isNode)
      .map((line) => {
        const quantityNode = childNode(line, 'InvoicedQuantity') ?? {};
        const taxTotal = childNode(line, 'TaxTotal') ?? {};
        const item = childNode(line, 'Item') ?? {};
        const price = childNode(line, 'Price') ?? {};

        return {
          id: safeGetStr(child(line, 'ID')),
          name: safeGetStr(child(item, 'Name')),
          quantity: safeGetNum(quantityNode),
          unitCode: safeGetStr(child(quantityNode, '@_unitCode')),
          price: safeGetNum(child(price, 'PriceAmount')),
          lineAmount: safeGetNum(child(line, 'LineExtensionAmount')),
          taxes: this.parseTaxSubtotals(child(taxTotal, 'TaxSubtotal')),
        };
      });
  }

  private parseTaxSubtotals(value: unknown): ParsedTaxSubtotal[] {
    return asArray(value)
      .filter(isNode)
      .map((subtotal) => {
        const taxCategory = childNode(subtotal, 'TaxCategory') ?? {};
        const taxScheme = childNode(taxCategory, 'TaxScheme') ?? {};

        return {
          taxableAmount: safeGetNum(child(subtotal, 'TaxableAmount')),
          taxAmount: safeGetNum(child(subtotal, 'TaxAmount')),
          percent: safeGetNum(child(subtotal, 'Percent')),
          taxCode: safeGetStr(child(taxScheme, 'TaxTypeCode')),
          taxName: safeGetStr(child(taxScheme, 'Name')),
        };
      });
  }
}
