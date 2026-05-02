import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client. Lifted out of main.tsx so non-React code
 * (the auth store) can `qc.clear()` on signOut — otherwise the previous
 * user's cached order/customer data lingers in module-level memory until
 * the next refetch, which is a PII leak on shared-device scenarios.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
