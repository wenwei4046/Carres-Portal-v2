import { test, expect } from "@playwright/test";

test("login form renders and accepts input", async ({ page }) => {
  await page.goto("/login");
  // Brand mark is the "Carres. Portal" lockup wrapped in an <h1>.
  await expect(page.getByRole("heading", { name: /Carres\.\s*Portal/i })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
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
