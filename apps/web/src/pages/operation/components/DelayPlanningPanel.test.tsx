import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DelayPlanningPanel from "./DelayPlanningPanel";
import { fmtDateShort } from "@/lib/fmt-date";

/**
 * C8 · the form that closes `Delay planning` — and the gate that keeps the
 * customer out of it.
 *
 * The two rules this file exists to hold are the two the card would not let a
 * build chat soften: **no surface may open a customer call about a delay**
 * (Law 4 rung 2), and **the promised date never moves** (§3 stage 3). Both are
 * asserted as absences, because that is what they are — a screen is wrong here
 * by CONTAINING something, not by lacking it.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetchMock(...a) }));

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const panel = () => (
  <DelayPlanningPanel
    orderId="o-1"
    supplierEtaIso="2026-08-30"
    promisedDateIso="2026-08-20"
  />
);

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ control: {} });
});

describe("DelayPlanningPanel", () => {
  it("asks one question, in Jess's two answers, under its own locked word", () => {
    render(wrap(panel()));
    expect(screen.getByText("Delay planning")).toBeInTheDocument();
    expect(
      screen.getByText("We can still make the promised date"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("We cannot make the promised date"),
    ).toBeInTheDocument();
    // The BUTTON word comes from the shared dictionary mirror, not from here.
    expect(screen.getByTestId("delay-decision-submit").textContent).toBe(
      "Record the delay decision",
    );
  });

  it("states both dates as FACTS and offers no control that could move either", () => {
    render(wrap(panel()));
    const el = screen.getByTestId("delay-planning-panel");
    expect(el.textContent).toContain(fmtDateShort("2026-08-20"));
    expect(el.textContent).toContain(fmtDateShort("2026-08-30"));
    // §3 stage 3 / invariant 1: `orders.delivery_date` stays at what was sold.
    // The only inputs on this panel are the two radios and the optional note —
    // there is no date field, so this flow structurally cannot rewrite history.
    expect(el.querySelectorAll('input[type="date"]')).toHaveLength(0);
    const inputs = [...el.querySelectorAll("input")];
    expect(inputs.filter((i) => i.type === "radio")).toHaveLength(2);
    expect(inputs.filter((i) => i.type !== "radio")).toHaveLength(1);
  });

  it("NEVER opens a call to the customer — Law 4 rung 2, as a rendered guard", () => {
    render(wrap(panel()));
    const text = screen.getByTestId("delay-planning-panel").textContent ?? "";
    expect(text).not.toMatch(/\bcustomer\b/i);
    expect(text).not.toMatch(/\bcall\b/i);
  });

  it("uses no banned word (COPY-STANDARD) — `Recovery` above all", () => {
    render(wrap(panel()));
    const text = screen.getByTestId("delay-planning-panel").textContent ?? "";
    expect(text).not.toMatch(
      /\b(recovery|chase|pending|at risk|attention|in progress|unscheduled)\b/i,
    );
  });

  it("cannot be submitted until an answer is picked", () => {
    render(wrap(panel()));
    const btn = screen.getByTestId("delay-decision-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("We can still make the promised date"));
    expect(btn.disabled).toBe(false);
  });

  it("sends the answer WITH the supplier date it was made about", async () => {
    render(wrap(panel()));
    fireEvent.click(screen.getByLabelText("We cannot make the promised date"));
    fireEvent.click(screen.getByTestId("delay-decision-submit"));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/operation/orders/o-1/delay-decision");
    expect(JSON.parse(String(init.body))).toEqual({
      decision: "new_date",
      supplierEta: "2026-08-30",
    });
  });

  it("omits an empty note rather than storing a blank one", async () => {
    render(wrap(panel()));
    fireEvent.click(screen.getByLabelText("We can still make the promised date"));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("delay-decision-submit"));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const [, init] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("note");
  });

  it("prints the server's reason when the decision is refused", async () => {
    apiFetchMock.mockRejectedValue(
      Object.assign(new Error("This order has no supplier ready date of 2026-08-30"), {
        status: 422,
      }),
    );
    render(wrap(panel()));
    fireEvent.click(screen.getByLabelText("We can still make the promised date"));
    fireEvent.click(screen.getByTestId("delay-decision-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("delay-decision-error").textContent).toContain(
        "no supplier ready date",
      ),
    );
  });
});
