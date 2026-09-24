/**
 * THE EXTERNAL LINK PAGE — the company sees the minimum and answers in one of
 * three structured ways; `opened` is posted only after the page has rendered;
 * a dead link says one sentence.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const calls: Array<{ path: string; init?: RequestInit }> = [];
let view: unknown = null;
let dead = false;

vi.mock("@/lib/api", async () => {
  class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }
  return {
    ApiError,
    apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (dead) throw new ApiError(404, "This link no longer works. Ask Carres for a new link.");
      if (!init) return view;
      return { saved: true };
    }),
  };
});

import DeliveryLinkPage from "./DeliveryLinkPage";

const TOKEN = "A".repeat(43);

function draw() {
  return render(
    <MemoryRouter initialEntries={[`/delivery-link/${TOKEN}`]}>
      <Routes>
        <Route path="/delivery-link/:token" element={<DeliveryLinkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  calls.length = 0;
  dead = false;
  view = {
    company: "AL Logistics",
    reference: "TCF0541",
    customerName: "LIM KUAN YANG",
    customerPhone: "0123456789",
    address: "12 Jalan Test, Klang",
    building: "Landed",
    requestedDate: "2026-10-27",
    goods: [{ name: "King Mattress", qty: 1 }],
    pickup: ["Supplier sends directly to logistics · AL Sungai Buloh"],
    scheduledDate: null,
    scheduledTime: null,
  };
});

describe("the external link page", () => {
  it("shows the minimum, posts `opened` after rendering, and offers three answers", async () => {
    draw();
    expect(await screen.findByText("AL Logistics")).toBeTruthy();
    expect(screen.getByText("TCF0541")).toBeTruthy();
    expect(screen.getByText("1 × King Mattress")).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/opened"))).toBe(true));
    const radios = screen.getAllByRole("radio").map((r) => r.textContent);
    expect(radios).toEqual(["Save scheduled delivery", "Ask for another date", "Cannot deliver"]);
    expect(document.body.textContent).not.toMatch(/SO-?\d/);
  });

  it("the save button waits for a date; the time is optional", async () => {
    draw();
    await screen.findByText("AL Logistics");
    expect((screen.getByTestId("delivery-link-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Scheduled time (optional)")).toBeTruthy();
  });

  it("Cannot deliver needs a reason before it can be saved", async () => {
    draw();
    await screen.findByText("AL Logistics");
    fireEvent.click(screen.getByRole("radio", { name: "Cannot deliver" }));
    expect((screen.getByTestId("delivery-link-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a dead link says one sentence and nothing else", async () => {
    dead = true;
    draw();
    expect(await screen.findByRole("alert")).toHaveTextContent("This link no longer works. Ask Carres for a new link.");
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
