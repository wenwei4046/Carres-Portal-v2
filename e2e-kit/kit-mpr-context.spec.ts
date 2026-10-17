import { mkdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
/** Opt-in actual-render acceptance. Memory transport only; SQL fixture has its
 * separate rolled-back lifecycle proof. Never describe this as browser-to-DB. */
test.skip(!process.env.MPR_CONTEXT_ACCEPTANCE, "Explicit isolated context acceptance only; local font files required");
for (const width of [390,1025,1164,1440]) for (const purpose of ["gp","rs"]) {
  test(`guarded ${purpose} Workspace Review/confirm/object ${width}`, async ({ page }) => {
    const root = process.env.MPR_CONTEXT_SHOTS ?? "/tmp/carres-context-browser"; mkdirSync(root, { recursive: true });
    await page.setViewportSize({ width, height: 1000 });
    await page.route("https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/**", async route => {
      const weight = /-(400|500|600|700)-normal/.exec(route.request().url())?.[1];
      await route.fulfill({ status: 200, contentType: "font/ttf", body: readFileSync(`${process.env.NOTO_DIR}/noto${weight}.ttf`), headers: { "access-control-allow-origin": "*" } });
    });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/manual-purchase-context-preview.html?purpose=${purpose}`);
    const send = page.getByTestId(width < 768 ? "mp-send-footer" : "mp-send"); await expect(send).toBeEnabled({ timeout: 60000 });
    // Native keyboard reaches the actual enabled primary action.
    await send.focus(); await expect(send).toBeFocused();
    await page.screenshot({ path: `${root}/${purpose}-${width}-create.png`, fullPage: true });
    await page.keyboard.press("Enter"); await expect(send).toHaveText("Confirm and send");
    expect(await page.evaluate(() => (window as unknown as { __mprContext: { snapshot(): { submissions: number } } }).__mprContext.snapshot().submissions)).toBe(0);
    await expect(send).toBeEnabled({ timeout: 60000 });
    await page.screenshot({ path: `${root}/${purpose}-${width}-review.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await send.click(); await expect(page.getByTestId("mp-object-items")).toBeVisible();
    await expect(page.getByTestId("mp-full-requested-need")).toContainText(purpose === "rs" ? "500" : "5");
    const approve = page.getByTestId("mp-approve"); await expect(approve).toBeEnabled();
    await approve.focus(); await expect(approve).toBeFocused();
    await page.screenshot({ path: `${root}/${purpose}-${width}-object.png`, fullPage: true });
    await approve.press("Enter");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __mprContext: { snapshot(): { approved: boolean } } }).__mprContext.snapshot().approved)).toBe(true);
    expect(errors).toEqual([]);
  });
}
for (const width of [390,1440]) for (const purpose of ["gp","rs"]) {
  test(`guarded parent ${purpose} partial Issue Review ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route("https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/**", async route => {
      const weight = /-(400|500|600|700)-normal/.exec(route.request().url())?.[1];
      await route.fulfill({ status: 200, contentType: "font/ttf", body: readFileSync(`${process.env.NOTO_DIR}/noto${weight}.ttf`), headers: { "access-control-allow-origin": "*" } });
    });
    await page.goto(`/manual-purchase-context-preview.html?purpose=${purpose}&entry=register`);
    const tick = page.getByTestId("mp-select-00000000-0000-4000-8000-000000000010");
    await expect(tick).toBeEnabled({ timeout: 60000 }); await tick.click();
    await page.getByTestId("mp-issue-selected").click();
    const qty = page.getByLabel("TEST-SKU · Qty"); await expect(qty).toHaveValue(purpose === "rs" ? "500" : "5");
    await qty.fill("1"); const create = page.getByTestId("so-batch-issue-create");
    if (purpose === "gp") {
      await expect(create).toBeDisabled(); await page.getByLabel("TEST recipient", { exact: true }).fill("1");
    }
    await expect(create).toBeEnabled({ timeout: 60000 });
    const root = process.env.MPR_CONTEXT_SHOTS ?? "/tmp/carres-context-browser"; mkdirSync(root, { recursive: true });
    await page.screenshot({ path: `${root}/${purpose}-${width}-partial-review.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await create.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __mprContext: { snapshot(): { issuedQty: number } } }).__mprContext.snapshot().issuedQty)).toBe(1);
    const result = await page.evaluate(() => (window as unknown as { __mprContext: { snapshot(): { lastIssue: { contextIssue: { allocations: Array<{ qty: number; recipients: unknown[] }> } }; stored: { lines: Array<{ qty: number }> } } } }).__mprContext.snapshot());
    expect(result.lastIssue.contextIssue.allocations[0].qty).toBe(1);
    expect(result.stored.lines[0].qty).toBe(purpose === "rs" ? 500 : 5);
    // No evidence declaration / supplier transport is invoked by this fixture.
  });
}
