import type { UblValidationIssue } from './types';

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
