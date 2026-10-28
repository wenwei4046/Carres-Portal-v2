/**
 * The shell reads the stored company identity (Settings → Company, 0669)
 * once after sign-in and hands it to the document letterhead, so every PDF
 * prints the identity Jess recorded — not a constant in code.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CompanyProfileValues } from "@carres/shared";
import { apiFetch } from "./api";
import { useAuth } from "./auth";
import { setCompanyIdentity } from "./pdf/company-identity-store";
import { settingsKeys } from "./settings-queries";

export function useCompanyIdentitySync(): void {
  const session = useAuth((s) => s.session);
  const query = useQuery({
    queryKey: settingsKeys.companyIdentity,
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async () => (await apiFetch<{ stored: boolean; values: CompanyProfileValues }>("/api/company-profile")).values,
  });
  useEffect(() => {
    setCompanyIdentity(session ? query.data ?? null : null);
  }, [session, query.data]);
}
