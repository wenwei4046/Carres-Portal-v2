/**
 * The company identity every printed document carries (Settings → Company,
 * 0669). Kept apart from `letterhead.tsx` so the shell can hand the stored
 * identity over at sign-in without loading the PDF engine.
 *
 * Until the stored identity is read, the verified identity from the owner's
 * letterhead (9 Oct 2026) prints — never a blank header.
 */
import { VERIFIED_COMPANY_PROFILE, companyAddressLines, type CompanyProfileValues } from "@carres/shared";

let companyIdentity: CompanyProfileValues = VERIFIED_COMPANY_PROFILE;

/** Hand the stored company identity to every document (null = the verified default). */
export function setCompanyIdentity(values: CompanyProfileValues | null | undefined): void {
  companyIdentity = values && values.legal_name && values.registration_no ? values : VERIFIED_COMPANY_PROFILE;
}

/** The registered address as at most three printed lines: the street lines,
 *  then postcode and city joined onto the last line, so a template that
 *  prints `addressLines[0..2]` never drops the postcode. */
export function printedAddressLines(p: CompanyProfileValues): string[] {
  const parts = companyAddressLines(p);
  const lines = parts.length <= 3 ? parts : [parts[0]!, parts[1]!, parts.slice(2).join(", ")];
  // Every line but the last ends with a comma, as the letterhead always did:
  // templates that print two lines on one row then still read as an address.
  return lines.map((l, i) => (i < lines.length - 1 && !/[,.]$/.test(l) ? `${l},` : l));
}

export const CARRES_COMPANY = {
  get legalName(): string { return companyIdentity.legal_name ?? VERIFIED_COMPANY_PROFILE.legal_name!; },
  get regNo(): string { return companyIdentity.registration_no ?? VERIFIED_COMPANY_PROFILE.registration_no!; },
  get addressLines(): string[] { return printedAddressLines(companyIdentity); },
  get supportName(): string | null { return companyIdentity.support_name; },
  get supportPhone(): string | null { return companyIdentity.support_phone; },
};
