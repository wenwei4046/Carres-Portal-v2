import { test, expect } from "@playwright/test";

test("dealer login → /me shows role + dealerId from JWT app_metadata", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "CARRES PORTAL" })).toBeVisible();

  await page.getByLabel("Email").fill("dealer@carres.com");
  await page.getByLabel("Password").fill("111");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/me", { timeout: 10_000 });

  // Browser session immediately reflects the Supabase JWT.
  await expect(page.getByText("dealer@carres.com")).toBeVisible();

  // /api/auth/me round-trip lands the role + dealerId from app_metadata.
  await expect(page.getByText("dealer", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("00000000-0000-0000-0000-000000000d01")).toBeVisible();
});

test("invalid credentials shows error and stays on /login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("dealer@carres.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText(/Email or password is incorrect/i)).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/login/);
});

test("RequireAuth redirects unauthenticated to /login", async ({ page }) => {
  // Hit /me directly without logging in (clean context per test)
  await page.goto("/me");
  await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
});
