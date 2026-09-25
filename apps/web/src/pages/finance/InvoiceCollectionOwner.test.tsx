import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InvoiceCollectionOwner from "./InvoiceCollectionOwner";

/**
 * The collection owner section (0489): normal owner · today's cover · acting
 * person from the one context read, the append-only history, and the formal
 * handover door for a principal or manager only.
 */
const state = vi.hoisted(() => ({
  owner: null as unknown,
  canAssign: false,
  posts: [] as Array<{ url: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST") { state.posts.push({ url, body: JSON.parse(init.body ?? "{}") }); return { handover: { id: "h" } }; }
    if (url.startsWith("/api/finance/collection-owner")) return { owner: state.owner };
    if (url.startsWith("/api/operation/workspace-duties")) return { can_assign: state.canAssign, duties: [] };
    if (url.startsWith("/api/operation/work")) return { contractVersion: 2, complete: true, items: [], staff: [
      { userId: "u-shasha", name: "Shasha", email: "shasha@carres.com" },
      { userId: "u-yujun", name: "Yu Jun", email: "yujun@carres.com" },
    ], generatedOn: "2026-09-13", closureReceipt: null,
      sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
        key, state: "healthy", observedAt: "2026-09-13T01:00:00.000Z", lastSuccessfulAt: "2026-09-13T01:00:00.000Z", errorLabel: null,
      })),
    };
    return {};
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SHASHA_OWNS = {
  order_id: "o1", normal_user_id: "u-shasha", normal_user_name: "Shasha",
  cover_user_id: null, cover_user_name: null, acting_user_id: "u-shasha", acting_user_name: "Shasha",
  is_cover: false, cover_ends_on: null, source: "established", effective_from: "2026-09-01", established_on: "2026-09-01",
  history: [{ id: "h1", source: "established", owner_user_id: "u-shasha", owner_user_name: "Shasha", previous_owner_user_id: null, previous_owner_user_name: null,
    reason: "Responsible Delivery Operation — the Delivery Duty holder when collection first became actionable", changed_by: null, changed_by_name: null, changed_at: "2026-09-01T01:00:00Z", effective_from: "2026-09-01" }],
};

function show(canRead = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><InvoiceCollectionOwner orderId="o1" canRead={canRead} /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => { state.owner = SHASHA_OWNS; state.canAssign = false; state.posts = []; });

describe("Collection owner", () => {
  it("prints normal owner, today's cover and the acting person as three facts", async () => {
    state.owner = { ...SHASHA_OWNS, is_cover: true, cover_user_id: "u-yujun", cover_user_name: "Yu Jun", acting_user_id: "u-yujun", acting_user_name: "Yu Jun", cover_ends_on: "2026-09-15" };
    show();
    expect(await screen.findByTestId("collection-owner-normal")).toHaveTextContent("Shasha");
    expect(screen.getByTestId("collection-owner-cover")).toHaveTextContent("Yu Jun");
    expect(screen.getByTestId("collection-owner-acting")).toHaveTextContent("Yu Jun");
  });

  it("no cover → the normal owner acts and the cover fact says so", async () => {
    show();
    expect(await screen.findByTestId("collection-owner-cover")).toHaveTextContent("No cover today");
    expect(screen.getByTestId("collection-owner-acting")).toHaveTextContent("Shasha");
    expect(screen.getByTestId("collection-owner-history")).toHaveTextContent("Established · Shasha");
  });

  it("nobody established → nobody is assigned to this order, with the Sales Orders door — never Delivery Duty, never a blank", async () => {
    state.owner = null;
    show();
    expect(await screen.findByTestId("collection-owner-none")).toHaveTextContent("Nobody is assigned to this order.");
    expect(screen.getByRole("link", { name: "Assign it in Sales Orders → Team" })).toHaveAttribute("href", "/operation/orders");
    expect(screen.queryByText(/Delivery Duty|Staff & Duties/)).not.toBeInTheDocument();
  });

  it("the handover door exists only for someone the Staff & Duties gate admits", async () => {
    show();
    await screen.findByTestId("collection-owner-facts");
    expect(screen.queryByTestId("collection-owner-handover-open")).not.toBeInTheDocument();
  });

  it("a formal handover carries new owner · reason · effective from to the one door", async () => {
    state.canAssign = true;
    show();
    fireEvent.click(await screen.findByTestId("collection-owner-handover-open"));
    const form = screen.getByTestId("collection-owner-handover");
    expect(form).toHaveTextContent("Previous owner: Shasha");
    await waitFor(() => expect(within(form).getByRole("option", { name: "Yu Jun" })).toBeInTheDocument());
    // The current owner is never offered as the new owner.
    expect(within(form).queryByRole("option", { name: "Shasha" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("collection-owner-new"), { target: { value: "u-yujun" } });
    expect(screen.getByTestId("collection-owner-handover-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("collection-owner-reason"), { target: { value: "Shasha moves to the showroom" } });
    fireEvent.click(screen.getByTestId("collection-owner-handover-save"));
    await waitFor(() => expect(state.posts).toHaveLength(1));
    expect(state.posts[0]).toMatchObject({
      url: "/api/finance/collection-owner/handover",
      body: { order_id: "o1", new_owner_user_id: "u-yujun", reason: "Shasha moves to the showroom" },
    });
    expect(String((state.posts[0]!.body as { effective_from: string }).effective_from)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Finance reads the facts only", () => {
    show(false);
    expect(screen.getByTestId("collection-owner")).toHaveTextContent("Owner facts are Operation's.");
  });
});
