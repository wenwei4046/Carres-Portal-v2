import { expect, test } from "@playwright/test";

for (const width of [1025, 1164, 1440]) {
  test(`Sales Order30Oct record keeps facts and the real PDF at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/sales-order-detail-preview.html");
    const layout = page.getByTestId("so-record-layout");
    await expect(layout).toBeVisible();
    await expect(page.getByTestId("pdf-pane").locator("canvas").first()).toBeVisible({ timeout: 20000 });
    const geometry = await layout.evaluate(el => {
      const children = [...el.children].map(child => child.getBoundingClientRect());
      return { ratio: children[0]!.width / children[1]!.width, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.ratio).toBeCloseTo(2, 1);
    expect(geometry.overflow).toBe(false);
    const paper = page.getByTestId("pdf-pane").locator("canvas").first();
    const before = (await paper.boundingBox())!.width;
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(async () => (await paper.boundingBox())!.width).toBeGreaterThan(before * 1.2);
    await page.getByRole("button", { name: "Fit width", exact: true }).click();
    await expect.poll(async () => (await paper.boundingBox())!.width).toBeCloseTo(before, 0);
    await page.getByRole("button", { name: "Full screen", exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute("aria-label"))).toBe("Sales Order PDF");
    await page.keyboard.press("Escape");
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  });
}

test("Sales Order record stacks the PDF when the usable window is narrow", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 1000 });
  await page.goto("/sales-order-detail-preview.html");
  const layout = page.getByTestId("so-record-layout");
  await expect(layout).toBeVisible();
  const boxes = await layout.evaluate(el => [...el.children].map(child => ({ top: child.getBoundingClientRect().top, width: child.getBoundingClientRect().width })));
  expect(boxes[1]!.top).toBeGreaterThan(boxes[0]!.top);
  expect(boxes[0]!.width).toBeCloseTo(boxes[1]!.width, 0);
});
