import { expect, test, type Page } from "@playwright/test";

const EVIDENCE = "docs/evidence/workspace-work";
const SH = "00000000-0000-4000-8000-0000000000aa";
test.setTimeout(60_000);

function workItem(id: string, label: string, module: "orders" | "delivery" | "payment", actionOn: string, placement: "missed" | "on_day") {
  return {
    contractVersion: 2, id, module, ruleKey: id.split(":").at(-1), ruleVersion: 1,
    object: { kind: module === "orders" ? "sales_order" : module === "delivery" ? "delivery_order" : "invoice", id: id.split(":")[1], label },
    problem: module === "orders" ? "No delivery date" : module === "delivery" ? "Delivery proof needs review" : "Customer balance due",
    action: module === "orders" ? "Ask customer for a delivery date" : module === "delivery" ? "Review the delivery proof" : "Ask customer to pay",
    recipient: module === "orders" ? "Tan Qu Qu" : null,
    requiredResult: module === "orders" ? "Customer Delivery exists" : module === "delivery" ? "Delivery proof reviewed" : "Customer balance settled",
    completionPredicate: `${module}.completion exists`, completionStatement: "Required result exists",
    owner: { rule: "duty", dutyKey: "delivery", normal: { userId: SH, name: "Shasha" }, activeCover: null, coverEvidence: null, acting: { userId: SH, name: "Shasha" }, state: "primary" },
    timing: {
      businessDueOn: actionOn, actionOn, placement,
      missedAge: { state: "counted", workingDays: placement === "missed" ? 2 : 0, basis: { calendarKey: "module+person", from: actionOn, to: "2026-09-17" } },
      eligibility: "eligible", noDateReason: null,
      calendar: { module: { key: module, source: module, state: "ready" }, actor: { key: "person:shasha", source: "people", state: "ready" }, holidayName: null },
    },
    communication: null, blocker: null, nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: `/operation/${module}/${id.split(":")[1]}` },
    destination: `/operation/${module}/${id.split(":")[1]}`,
    observedAt: "2026-09-17T01:42:00.000Z", sourceVersion: "2026-09-17T01:42:00.000Z",
    tone: placement === "missed" ? "danger" : "warning", locked: false, broken: false,
  };
}

const FIXTURE = {
  contractVersion: 2, complete: true, generatedOn: "2026-09-17", closureReceipt: null,
  staff: [{ userId: SH, name: "Shasha", email: "shasha@carres.test" }],
  items: [
    workItem("orders:order-1318:ask_delivery_date", "SO-1318", "orders", "2026-09-15", "missed"),
    workItem("delivery:do-2041:review_proof", "DO-2041", "delivery", "2026-09-17", "on_day"),
    workItem("payment:invoice-2041:collect_balance", "INV-2041", "payment", "2026-09-17", "on_day"),
  ],
  sources: ["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"].map((key) => ({ key, state: "healthy", observedAt: "2026-09-17T01:42:00.000Z", lastSuccessfulAt: "2026-09-17T01:42:00.000Z", errorLabel: null })),
};

async function useGovernedFixture(page: Page) {
  await page.route("**/api/operation/work", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURE) }));
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  const emailField = page.getByLabel(/email/i);
  if (await emailField.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await emailField.fill(email);
    await page.getByLabel("Passphrase", { exact: true }).fill(password);
    await page.getByRole("button", { name: /enter portal/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  } else {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  }
}

async function openWork(page: Page) {
  const feed = page.waitForResponse((response) => response.url().includes("/api/operation/work"));
  await page.goto("/operation?tab=work");
  await feed;
  await expect(page.getByTestId("operation-work")).toBeVisible();
  await expect(page.getByTestId("work-view-mine")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("work-loading")).toHaveCount(0);
}

test("manager opens the governed Work composition", async ({ page }) => {
  await login(page, "principal@carres.com", "111");
  await useGovernedFixture(page);
  await openWork(page);
  await expect(page.getByTestId("work-view-team")).toBeVisible();
  await page.getByTestId("work-view-team").click();
  await expect(page).toHaveURL(/scope=team/);
});

test("operation user opens the governed Work composition", async ({ page }) => {
  test.skip(!process.env.WORK_OPERATION_EMAIL || !process.env.WORK_OPERATION_PASSWORD, "A live non-manager acceptance account is required");
  await login(page, process.env.WORK_OPERATION_EMAIL!, process.env.WORK_OPERATION_PASSWORD!);
  await useGovernedFixture(page);
  await openWork(page);
  await expect(page.getByTestId("work-view-team")).toBeVisible();
});

test("selection has a descriptive name and the owning-object door preserves browser Back", async ({ page }) => {
  await login(page, "principal@carres.com", "111");
  await useGovernedFixture(page);
  await openWork(page);
  await page.getByTestId("work-view-team").click();
  const row = page.locator('[data-testid^="work-row-"]').first();
  if (await row.count()) {
    await expect(row).toHaveAccessibleName(/SO-1318.*No delivery date.*Ask customer for a delivery date/);
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/selected=/);
    const open = page.getByRole("button", { name: /^Open / }).first();
    await expect(open).toBeVisible();
    const workUrl = page.url();
    await open.click();
    await page.goBack();
    await expect(page).toHaveURL(workUrl);
  }
});

for (const size of [
  { width: 1440, height: 900, name: "1440x900" },
  { width: 1180, height: 820, name: "1180x820" },
  { width: 820, height: 900, name: "820x900" },
  { width: 390, height: 844, name: "390x844" },
]) {
  test(`responsive Work evidence ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await login(page, "principal@carres.com", "111");
    await useGovernedFixture(page);
    await openWork(page);
    await page.getByTestId("work-view-team").click();
    await expect(page.getByTestId("work-split-shell")).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    await page.screenshot({ path: `${EVIDENCE}/${size.name}.png`, fullPage: true });
  });
}
