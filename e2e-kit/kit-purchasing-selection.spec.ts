import { expect, test } from "@playwright/test";

// Real shell + buying controls, fixture reads only: never Issue PO in this walk.
for (const width of [825, 1025, 1440]) {
  test(`Purchasing dismissal, independent selection and Tasks at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 804 });
    await page.goto('/so-batch-shell-preview.html?reminder=1');
    const reminder = page.getByRole('dialog', { name: 'Pending work' });
    await expect(reminder).toBeVisible();
    await expect(page.locator('[data-kit="dialog-overlay"]')).toHaveCount(1);
    await page.getByTestId('pending-work-got-it').click();
    await expect(reminder).toHaveCount(0);
    await expect(page.locator('[data-kit="dialog-overlay"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveCSS('pointer-events', 'none');
    await expect(page.getByTestId('shell-header').getByTestId('tasks-pill')).toHaveCount(0);
    await expect(page.getByTestId('portal-sidebar')).toHaveCSS('width', '64px');
    // A remembered panel may be open on a wide screen. Hide it to test its door.
    const hide = page.getByRole('button', { name: 'Hide tasks', exact: true });
    if (await hide.isVisible()) await hide.click();
    const group = page.locator('input[data-testid^="by-supplier-select-"]:enabled').first();
    await group.check();
    const expand = page.getByTestId('by-supplier').getByRole('button', { name: 'Expand row' }).first();
    await expand.click();
    await expect(group).toBeChecked();
    const child = page.locator('input[data-testid^="by-supplier-tick-"]:enabled').first();
    await child.uncheck();
    await expect(group).not.toBeChecked();
    await child.check();
    await expect(group).toBeChecked();
    const selected = await page.getByTestId('selection-bar').textContent();
    await page.getByTestId('tasks-pill').click();
    await expect(page.getByTestId('shell-tasks')).toBeVisible();
    await page.getByRole('button', { name: 'Hide tasks', exact: true }).click();
    await expect(page.getByTestId('selection-bar')).toHaveText(selected!);
    await expect(child).toBeChecked();
    await expect(page.locator('[data-kit="dialog-overlay"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select all rows', exact: true }).check();
    await expect(group).toBeChecked();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    // Navigation opens in place on the left and returns to its unchanged selection.
    await child.check();
    await page.getByRole('button', { name: 'Expand menu', exact: true }).click();
    await expect(page.getByTestId('portal-sidebar')).toHaveCSS('width', '220px');
    await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Collapse menu', exact: true }).click();
    await expect(page.getByTestId('portal-sidebar')).toHaveCSS('width', '64px');
    await expect(child).toBeChecked();
    await expect(reminder).toHaveCount(0);
    await page.reload();
    await expect(reminder).toHaveCount(0); // once per person/day, no route re-open
    await page.screenshot({ path: `output/purchasing-shell-selection/purchasing-${width}.png`, fullPage: true });
  });
}

for (const close of ['Close', 'Escape', 'View tasks']) {
  test(`Pending work leaves no click lock after ${close}`, async ({ page }) => {
    await page.setViewportSize({ width: 825, height: 804 });
    await page.goto('/so-batch-shell-preview.html?reminder=1');
    const reminder = page.getByRole('dialog', { name: 'Pending work' });
    await expect(reminder).toBeVisible();
    if (close === 'Escape') await page.keyboard.press('Escape');
    else if (close === 'View tasks') await page.getByTestId('pending-work-view').click();
    else await reminder.locator('[data-kit="dialog-close"]').click();
    await expect(reminder).toHaveCount(0);
    if (close === 'View tasks') {
      await expect(page.getByTestId('shell-tasks')).toBeVisible();
      await page.getByRole('button', { name: 'Hide tasks', exact: true }).click();
    }
    await expect(page.locator('[data-kit="dialog-overlay"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveCSS('pointer-events', 'none');
    const row = page.locator('input[data-testid^="by-supplier-select-"]:enabled').first();
    await row.check();
    await expect(row).toBeChecked();
  });
}
