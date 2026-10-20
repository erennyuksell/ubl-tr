import { XMLBuilder } from 'fast-xml-parser';
import type { UblInvoiceDocument, UblValue, UblXmlOptions } from './types';

const DEFAULT_NAMESPACES: Record<string, string> = {
  xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** UBL extension elements: their own namespace (`ext`), whatever they contain. */
const EXTENSION_ELEMENTS = new Set(['UBLExtensions', 'UBLExtension', 'ExtensionContent']);

/**
 * The element's qualified name. UBL puts every element in one of two namespaces by its kind: an aggregate
 * (an element with child elements) is `cac`, a basic component (text, an amount, a code, with or without
 * attributes) is `cbc`. The document object says which is which: a child object without `$value` holds
 * elements, anything else holds text. A name that already has a prefix is kept.
 */
function qualifiedName(name: string, value: unknown): string {
  if (name.includes(':')) return name;
  if (EXTENSION_ELEMENTS.has(name)) return `ext:${name}`;
  const sample = Array.isArray(value) ? value[0] : value;
  const isAggregate = isRecord(sample) && !Object.prototype.hasOwnProperty.call(sample, '$value');
  return `${isAggregate ? 'cac' : 'cbc'}:${name}`;
}

function normalizeForXml(value: UblValue | Record<string, string> | undefined): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForXml(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  const attributes = isRecord(value.$attributes) ? value.$attributes : undefined;
  const hasTextValue = Object.prototype.hasOwnProperty.call(value, '$value');

  if (hasTextValue) {
    normalized['#text'] = value.$value;
  }
  if (attributes) {
    for (const [key, attributeValue] of Object.entries(attributes)) {
      normalized[`@_${key}`] = String(attributeValue);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === '$value' || key === '$attributes') continue;
    normalized[qualifiedName(key, child)] = normalizeForXml(child as UblValue);
  }

  return normalized;
}

export function toUblXml(document: UblInvoiceDocument, options: UblXmlOptions = {}): string {
  const rootName = options.rootName ?? 'Invoice';
  const namespaces = {
    ...DEFAULT_NAMESPACES,
    ...options.namespaces,
  };
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    format: options.pretty ?? true,
    suppressEmptyNode: false,
  });

  const normalizedDocument = normalizeForXml(document);
  const rootAttributes = Object.fromEntries(
    Object.entries(namespaces).map(([key, value]) => [`@_${key}`, value]),
  );
  const body = builder.build({
    [rootName]: {
      ...rootAttributes,
      ...(isRecord(normalizedDocument) ? normalizedDocument : {}),
    },
  });

  if (options.declaration === false) return body;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}
