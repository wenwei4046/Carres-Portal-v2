import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait for the post-signin redirect to land away from /login. Without this,
  // a follow-up page.goto() can race the auth listener and RequireAuth bounces
  // back to /login before useAuth.session populates.
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 10_000,
  });
}

// Pre-condition: pnpm seed:test-users (creates logistics-test@x.com).
//
// Phase 4.5 Chunk 2 Sprint F migrated /logistics/procurement from a single
// page into a nested route shell `TabbedProcurementShell.tsx` with 3 child
// tabs (per spec §4.1):
//   • /logistics/procurement/nice-future
//   • /logistics/procurement/hookka-sofa
//   • /logistics/procurement/hookka-bedframe
// PROCUREMENT_TAB_SLUGS (packages/shared/src/sops.ts) is the source of truth
// for valid slugs. Invalid slugs and the bare /procurement parent path both
// redirect to the default tab `nice-future`.
test("phase-4.5-chunk-2: tab routing — direct URL + back/forward + slug fallback", async ({ page }) => {
  // 1. Login as logistics user.
  await login(page, "logistics-test@x.com", "logistics-test-password");

  // 2. Direct URL access to nice-future tab — Nice Future POs visible.
  await page.goto("/logistics/procurement/nice-future");
  await expect(page).toHaveURL(/\/logistics\/procurement\/nice-future$/);
  await expect(page.getByRole("tab", { name: /nice future/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // Nice Future POs visible (mattress channel via deriveProcurementSlug).
  await expect(page.getByTestId("procurement-tab-content-nice-future")).toBeVisible();

  // 3. Click "HoOKkA Sofa" tab → URL becomes /logistics/procurement/hookka-sofa.
  await page.getByRole("tab", { name: /hookka sofa|HoOKkA Sofa/i }).click();
  await expect(page).toHaveURL(/\/logistics\/procurement\/hookka-sofa$/);
  await expect(page.getByTestId("procurement-tab-content-hookka-sofa")).toBeVisible();
  // Nice Future list should no longer be in the DOM (route swap, not hidden).
  await expect(page.getByTestId("procurement-tab-content-nice-future")).toHaveCount(0);

  // 4. Browser back → returns to Nice Future. URL + selected tab + visible
  //    POs must all stay in sync (React Router 7 nested-route + outlet).
  await page.goBack();
  await expect(page).toHaveURL(/\/logistics\/procurement\/nice-future$/);
  await expect(page.getByRole("tab", { name: /nice future/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("procurement-tab-content-nice-future")).toBeVisible();

  // 5. Browser forward → returns to HoOKkA Sofa.
  await page.goForward();
  await expect(page).toHaveURL(/\/logistics\/procurement\/hookka-sofa$/);
  await expect(page.getByTestId("procurement-tab-content-hookka-sofa")).toBeVisible();

  // 6. Direct URL with invalid slug → redirects to default `nice-future`.
  //    PROCUREMENT_TAB_SLUGS guard in TabbedProcurementShell catches anything
  //    not in the union and `<Navigate replace>` lands on nice-future.
  await page.goto("/logistics/procurement/foobar");
  await expect(page).toHaveURL(/\/logistics\/procurement\/nice-future$/);

  // 7. Bare parent URL with no slug → also redirects to default `nice-future`
  //    (the App.tsx nested route uses an `index` route with redirect).
  await page.goto("/logistics/procurement");
  await expect(page).toHaveURL(/\/logistics\/procurement\/nice-future$/);
});
