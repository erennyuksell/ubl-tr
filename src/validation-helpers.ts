import { isValidTaxId } from './identity';
import type { UblAddress, UblValidationIssue } from './types';

export function isBlank(value: string | undefined): boolean {
  return value == null || value.trim() === '';
}

export function addIssue(issues: UblValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

/** A VKN/TCKN: 10 or 11 digits with matching check digits. */
export function checkTaxId(vkn: string, path: string, issues: UblValidationIssue[]): void {
  if (!/^\d{10}$|^\d{11}$/.test(vkn)) {
    addIssue(issues, path, 'VKN must be 10 digits or TCKN must be 11 digits.');
  } else if (!isValidTaxId(vkn)) {
    addIssue(issues, path, 'VKN/TCKN check digits do not match; the number is mistyped.');
  }
}

export function checkAddress(
  address: UblAddress | undefined,
  path: string,
  issues: UblValidationIssue[],
): void {
  if (!address) {
    addIssue(issues, path, 'Postal address is required.');
    return;
  }
  if (isBlank(address.city)) addIssue(issues, `${path}.city`, 'City is required.');
  if (isBlank(address.country)) addIssue(issues, `${path}.country`, 'Country is required.');
}
