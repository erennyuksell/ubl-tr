import type { UblValidationIssue } from './types';

/**
 * Thrown by `InvoiceParser.parse` for a document it refuses to read: one with a DOCTYPE or an ENTITY declaration.
 * UBL-TR invoices have neither; a declared entity can expand without bound or reach outside the document.
 */
export class UblParseError extends Error {
  readonly reason: 'doctype-not-allowed';

  constructor(reason: 'doctype-not-allowed', message: string) {
    super(message);
    this.name = 'UblParseError';
    this.reason = reason;
  }
}

/** Thrown by the calculator, the builder and `assertValidUblInvoiceInput`; `issues` lists every problem. */
export class UblValidationError extends Error {
  readonly issues: UblValidationIssue[];

  constructor(issues: UblValidationIssue[]) {
    super(
      `Invalid UBL-TR invoice input: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
    );
    this.name = 'UblValidationError';
    this.issues = issues;
  }
}
