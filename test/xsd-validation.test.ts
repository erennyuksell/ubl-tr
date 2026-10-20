import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildUblInvoiceXml } from '../src';
import { VARIANTS } from './fixtures/invoice-variants';

// Checks the XML against GİB's own UBL-TR 1.2.1 schema (a copy in test/gib, or UBL_TR_XSD) with xmllint.
// Without xmllint the test is skipped locally; on CI (CI set) it fails, so CI never passes without it.
const SCHEMA =
  process.env.UBL_TR_XSD ??
  path.join(__dirname, 'gib', 'ubl-tr-1.2.1', 'xsdrt', 'maindoc', 'UBL-Invoice-2.1.xsd');
const HAS_XMLLINT = (() => {
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const CAN_RUN = HAS_XMLLINT && existsSync(SCHEMA);
if (process.env.CI && !CAN_RUN)
  throw new Error(`GİB schema test cannot run on CI: xmllint or ${SCHEMA} missing.`);

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

describe.skipIf(!CAN_RUN)("XML against GİB's UBL-TR 1.2.1 schema", () => {
  for (const [name, input] of VARIANTS) {
    it(`is valid: ${name}`, () => {
      expect(schemaErrors(buildUblInvoiceXml(input), name.replace(/\W+/g, '-'))).toBe('');
    });
  }
});
