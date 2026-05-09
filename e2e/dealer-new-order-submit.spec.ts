import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 2B.3.c — full wizard happy path, end-to-end:
 *   1. Login as dealer
 *   2. Open New Order from dashboard CTA
 *   3. Step 1 — fill customer + delivery
 *   4. Step 2 — pick first mattress variant + add line
 *   5. Step 3 — sign canvas, attach payment slip, accept terms
 *   6. Submit → ThankYou with order number visible + copyable
 *
 * The Storage upload + RPC happen against the real local Supabase. The
 * "Submit order" button stays disabled until step3Valid passes; we assert
 * that as we go so a regression in any earlier step surfaces immediately.
 */

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dealer/, { timeout: 10_000 });
}

async function fillStep1(page: Page) {
  await expect(page.getByRole("combobox").first()).toBeEnabled({ timeout: 10_000 });
  // Dialog selects in order: 0=outlet, 1=salesperson, 2=state, 3=city,
  // 4=postcode, 5=relationship. Cascading address must pick state before city.
  await page.locator("select").nth(0).selectOption({ index: 1 });
  await page.locator("select").nth(1).selectOption({ index: 1 });
  await page.getByPlaceholder(/Tan Mei Ling/i).fill("E2E Submit Customer");
  await page.getByPlaceholder("012-3456789").fill("012-1234567");
  await page.getByPlaceholder(/Building, unit, street/i).fill("12-3, Jalan E2E Submit");
  await page.locator("select").nth(2).selectOption("Selangor");
  await page.locator("select").nth(3).selectOption("Petaling Jaya");
  await page.locator("select").nth(4).selectOption({ index: 1 });
  await page.getByPlaceholder("Name").fill("E2E Spouse");
  await page.getByPlaceholder("012-9988776").fill("012-7654321");
  await page.locator("select").nth(5).selectOption("Spouse");
  await page.locator('input[type="date"]').fill("2026-06-15");
  await page.getByRole("button", { name: /Continue/i }).click();
}

async function fillStep2(page: Page) {
  await expect(page.getByText(/Products & add-ons/i)).toBeVisible({ timeout: 10_000 });
  // Open the first mattress model accordion
  await page
    .locator("button")
    .filter({ hasText: /\d+ variants?/ })
    .first()
    .click();
  // Pick the first size variant in the configurator that just expanded
  const allSelects = page.locator("select");
  const lastSelect = allSelects.nth((await allSelects.count()) - 1);
  await lastSelect.selectOption({ index: 1 });
  // + Add the line
  await page.getByRole("button", { name: /\+ Add/ }).first().click();
  // Continue → Step 3
  await page.getByRole("button", { name: /Continue/i }).click();
}

/** Simulate a signature: paint pixels onto the canvas + dispatch the React-
 *  recognizable mousedown/mousemove/mouseup sequence so onChange fires with
 *  a non-empty dataURL. page.mouse alone seems flaky in headless CDP for
 *  React's synthetic listener, so we fire DOM MouseEvents directly. */
async function signOnCanvas(page: Page) {
  const canvas = page.locator('canvas[aria-label="Customer signature pad"]');
  await expect(canvas).toBeVisible();
  await page.evaluate(() => {
    const c = document.querySelector(
      'canvas[aria-label="Customer signature pad"]',
    ) as HTMLCanvasElement | null;
    if (!c) throw new Error("signature canvas not found");
    const rect = c.getBoundingClientRect();
    const fire = (type: string, x: number, y: number) => {
      c.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + x,
          clientY: rect.top + y,
          button: 0,
        }),
      );
    };
    fire("mousedown", 20, 20);
    fire("mousemove", 80, 60);
    fire("mousemove", 160, 90);
    fire("mousemove", 220, 70);
    fire("mouseup", 220, 70);
  });
  await expect(page.getByText(/✓ Signed/)).toBeVisible();
}

async function attachSlip(page: Page) {
  // 1×1 PNG fixture as base64 — small enough to send over the FileChooser
  // bridge without spilling into a real binary asset on disk.
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNg+M8AAAICAQEqo+UoAAAAAElFTkSuQmCC",
    "base64",
  );
  // The Step 3 picker exposes two hidden inputs (camera + file). On desktop
  // only the "Attach file" button is shown; setInputFiles works on the
  // hidden input directly via its aria-label.
  await page.locator('input[aria-label="Attach file"]').setInputFiles({
    name: "slip.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await expect(page.getByText(/✓ Attached/)).toBeVisible();
}

async function acceptTerms(page: Page) {
  await page
    .getByRole("checkbox", { name: /Customer accepts all terms/i })
    .check();
}

test.describe("Phase 2B.3.c — full wizard happy path", () => {
  test("Step 3 → Submit → ThankYou with order number", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await page.getByRole("link", { name: /\+ New order/i }).first().click();
    await fillStep1(page);
    await fillStep2(page);

    // Step 3 visible
    await expect(page.getByText(/step 3 of 3/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Confirm and sign/i)).toBeVisible();

    // Submit is disabled until everything is filled
    const submit = page.getByRole("button", { name: /Submit order/i });
    await expect(submit).toBeDisabled();

    // Sign + slip + terms
    await signOnCanvas(page);
    await expect(submit).toBeDisabled();
    await attachSlip(page);
    await expect(submit).toBeDisabled();
    await acceptTerms(page);
    await expect(submit).toBeEnabled();

    // Submit → ThankYou
    await submit.click();

    // Scope every post-submit assertion to the dialog — kanban cards from
    // previous runs include the same customer name + can produce strict-mode
    // collisions otherwise.
    const dialog = page.getByRole("dialog", { name: /New order/i });

    // The ThankYou screen renders "Order placed" as a kicker <p> (not a heading)
    // + a "Thank you" heading. Submit can take a few seconds (Storage uploads
    // + POST + RPC + nested fetch), so give it generous timeout.
    await expect(
      dialog.getByText("Order placed"),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      dialog.getByRole("heading", { name: /Thank you/i }),
    ).toBeVisible();
    await expect(dialog.getByText(/^CO-\d+$/)).toBeVisible();
    // (Customer name is no longer rendered on the ThankYou screen — the
    // current UI shows order number + "Thank you · share with the customer
    // when ready". Customer name verification belongs in the order detail
    // modal, not the wizard ThankYou.)

    // Copy + close path is reachable
    await expect(
      dialog.getByRole("button", { name: /Back to dashboard/i }),
    ).toBeEnabled();
    await expect(dialog.getByRole("button", { name: /\+ New order/i })).toBeEnabled();
  });
});
