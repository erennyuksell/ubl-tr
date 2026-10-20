import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildUblInvoiceXml } from '../src';
import { VARIANTS } from './fixtures/invoice-variants';

// Runs GİB's own e-Fatura schematron (all of its rules) on one invoice of each kind ubl-tr builds. Neither
// the schematron nor the tools ship with the package: run scripts/fetch-schematron-tools.sh once (Saxon-HE
// and SchXslt from Maven Central, Java needed) and point UBL_TR_SCHEMATRON at the `schematron` folder of
// GİB's e-Fatura package. An e-Arşiv invoice is checked with the schematron's `type` set to `earchive`.
const SCHEMATRON_DIR = process.env.UBL_TR_SCHEMATRON ?? '';
const TOOLS = path.join(__dirname, '..', '.cache', 'schematron-tools');
const CLASSPATH = ['Saxon-HE-12.5.jar', 'xmlresolver-5.2.2.jar'].map((jar) =>
  path.join(TOOLS, jar),
);
const PIPELINE = path.join(TOOLS, 'schxslt', 'xslt', '2.0', 'pipeline-for-svrl.xsl');
const MAIN = 'UBL-TR_Main_Schematron.xml';

const HAS_JAVA = (() => {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const CAN_RUN =
  HAS_JAVA &&
  SCHEMATRON_DIR !== '' &&
  existsSync(path.join(SCHEMATRON_DIR, MAIN)) &&
  [...CLASSPATH, PIPELINE].every((file) => existsSync(file));

function saxon(args: string[]): void {
  execFileSync('java', ['-cp', CLASSPATH.join(path.delimiter), 'net.sf.saxon.Transform', ...args], {
    stdio: 'pipe',
  });
}

const workDir = CAN_RUN ? mkdtempSync(path.join(tmpdir(), 'ubl-tr-sch-')) : '';
const failures = new Map<string, string[]>();
let refusedMessages: string[] = [];

beforeAll(() => {
  if (!CAN_RUN) return;
  // The schematron declares no query binding but uses XPath 2 (matches, castable as): compile a copy as xslt2.
  const schDir = path.join(workDir, 'sch');
  mkdirSync(schDir);
  for (const file of readdirSync(SCHEMATRON_DIR).filter((name) => name.endsWith('.xml'))) {
    let text = readFileSync(path.join(SCHEMATRON_DIR, file), 'utf8');
    if (file === MAIN) text = text.replace('<sch:schema ', '<sch:schema queryBinding="xslt2" ');
    writeFileSync(path.join(schDir, file), text);
  }
  const compiled = path.join(workDir, 'gib-efatura.xsl');
  saxon([`-s:${path.join(schDir, MAIN)}`, `-xsl:${PIPELINE}`, `-o:${compiled}`]);

  for (const type of ['efatura', 'earchive'] as const) {
    const inDir = path.join(workDir, `in-${type}`);
    const outDir = path.join(workDir, `out-${type}`);
    mkdirSync(inDir);
    mkdirSync(outDir);
    const variants = VARIANTS.filter(
      ([, input]) => (input.profileId === 'EARSIVFATURA') === (type === 'earchive'),
    );
    if (!variants.length) continue;
    variants.forEach(([, input], index) =>
      writeFileSync(path.join(inDir, `${index}.xml`), buildUblInvoiceXml(input)),
    );
    // A document GİB refuses (CopyIndicator must be false), so a silent harness cannot pass.
    if (type === 'efatura') {
      const [, first] = variants[0]!;
      const refused = buildUblInvoiceXml(first).replace(
        '<cbc:CopyIndicator>false</cbc:CopyIndicator>',
        '<cbc:CopyIndicator>true</cbc:CopyIndicator>',
      );
      writeFileSync(path.join(inDir, 'refused.xml'), refused);
    }
    saxon([`-s:${inDir}`, `-xsl:${compiled}`, `-o:${outDir}`, `type=${type}`]);
    variants.forEach(([name], index) => {
      const svrl = readFileSync(path.join(outDir, `${index}.xml`), 'utf8');
      const failed = [
        ...svrl.matchAll(/<svrl:failed-assert[\s\S]*?<svrl:text>([\s\S]*?)<\/svrl:text>/g),
      ];
      failures.set(
        name,
        failed.map((match) => (match[1] ?? '').replace(/\s+/g, ' ').trim()),
      );
    });
    if (type === 'efatura') {
      const svrl = readFileSync(path.join(outDir, 'refused.xml'), 'utf8');
      refusedMessages = [...svrl.matchAll(/<svrl:text>([\s\S]*?)<\/svrl:text>/g)].map(
        (match) => match[1] ?? '',
      );
    }
  }
}, 120_000);

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe.skipIf(!CAN_RUN)("XML against GİB's e-Fatura schematron", () => {
  it('reports what GİB refuses', () => {
    expect(refusedMessages.some((message) => message.includes('CopyIndicator'))).toBe(true);
  });

  for (const [name] of VARIANTS) {
    it(`passes every rule: ${name}`, () => {
      expect(failures.get(name)).toEqual([]);
    });
  }
});
