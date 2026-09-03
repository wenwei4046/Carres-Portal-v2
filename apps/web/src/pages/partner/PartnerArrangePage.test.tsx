/**
 * DELIVERY DATES — the ruled partner screen, held as tests (Card 07).
 * Two acts and no third; the ruled minimum facts; the reported state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PartnerDeliveryCard } from "@carres/shared";

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

import PartnerArrangePage, { PA } from "./PartnerArrangePage";

const CARD: PartnerDeliveryCard = {
  orderId: "00000000-0000-0000-0000-0000000a0001",
  leg: 0,
  doNumber: null,
  customerName: "Kong Chai Yin",
  customerPhone: "0162389000",
  area: "Klang, Selangor",
  building: "Landed",
  goodsSummary: "1 × mattress:M1401F-K",
  requestedDate: "2026-09-05",
  specialRequirements: null,
  confirmedDate: null,
  confirmedTime: null,
  expectedArrival: null,
  note: null,
  cannotDeliverReported: false,
};

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PartnerArrangePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("the ruled partner screen", () => {
  it("shows the minimum facts and exactly the two ruled acts", async () => {
    apiFetchMock.mockResolvedValue({ partner: "NETS", deliveries: [CARD] });
    wrap();
    const card = await screen.findByTestId(`partner-delivery-${CARD.orderId}-0`);
    expect(within(card).getByText("Kong Chai Yin")).toBeTruthy();
    expect(within(card).getByText(/Customer asked:/)).toBeTruthy();
    expect(within(card).getByText(PA.noDo)).toBeTruthy();
    // The two acts…
    expect(within(card).getByTestId("partner-save-arrangement").textContent).toBe(PA.save);
    expect(within(card).getByTestId("partner-cannot-deliver").textContent).toBe(PA.cannotDeliver);
    // …and no third: no Accept, no money, no reassignment.
    expect(within(card).queryByText(/accept/i)).toBeNull();
    expect(within(card).queryByText(/RM\s?\d/)).toBeNull();
  });

  it("saves through the partner door with only the four partner fields", async () => {
    apiFetchMock.mockResolvedValue({ partner: "NETS", deliveries: [CARD] });
    wrap();
    const card = await screen.findByTestId(`partner-delivery-${CARD.orderId}-0`);
    fireEvent.change(within(card).getByTestId("partner-confirmed-date"), {
      target: { value: "2026-09-05" },
    });
    apiFetchMock.mockResolvedValueOnce({ saved: true });
    fireEvent.click(within(card).getByTestId("partner-save-arrangement"));
    const putCall = apiFetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/arrangement"),
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse((putCall![1] as { body: string }).body) as Record<string, unknown>;
    expect(body.confirmedDate).toBe("2026-09-05");
    expect(body).not.toHaveProperty("partnerId");
  });

  it("Cannot Deliver demands a reason before it will send", async () => {
    apiFetchMock.mockResolvedValue({ partner: "NETS", deliveries: [CARD] });
    wrap();
    const card = await screen.findByTestId(`partner-delivery-${CARD.orderId}-0`);
    fireEvent.click(within(card).getByTestId("partner-cannot-deliver"));
    const send = within(card).getByTestId("partner-cannot-deliver-send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(card).getByTestId("partner-cannot-deliver-reason"), {
      target: { value: "no_capacity" },
    });
    expect(send.disabled).toBe(false);
    // `other` re-locks until the note is written.
    fireEvent.change(within(card).getByTestId("partner-cannot-deliver-reason"), {
      target: { value: "other" },
    });
    expect(send.disabled).toBe(true);
  });

  it("a reported scope shows the waiting note instead of the form", async () => {
    apiFetchMock.mockResolvedValue({
      partner: "NETS",
      deliveries: [{ ...CARD, cannotDeliverReported: true }],
    });
    wrap();
    const card = await screen.findByTestId(`partner-delivery-${CARD.orderId}-0`);
    expect(within(card).getByTestId("partner-cannot-deliver-reported")).toBeTruthy();
    expect(within(card).queryByTestId("partner-save-arrangement")).toBeNull();
  });

  it("says so plainly when nothing is waiting", async () => {
    apiFetchMock.mockResolvedValue({ partner: "NETS", deliveries: [] });
    wrap();
    expect(await screen.findByText(PA.empty)).toBeTruthy();
  });
});
