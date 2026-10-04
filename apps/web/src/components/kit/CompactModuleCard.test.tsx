/**
 * CompactModuleCard — the interaction contract of UI MASTER §4.3 (owner rules
 * 2026-10-04). Pixel parity with the owner's reference page is proven
 * separately by scripts/compact-card-states.mjs.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import CompactModuleCard, { CARD_WORDS, CardEditorButtons, draftLink, formatCardTime, type CardModule, type CardTimelineEvent, type SavedTemplate, type TemplateStore } from "./CompactModuleCard";

const PAID: CardTimelineEvent = { id: "e1", actorName: "Jess", actorInitial: "J", summary: "{payment}", at: "2026-09-30T08:08:32.181911Z", result: "{receipt}" };
const DATE_ONLY: CardTimelineEvent = { id: "e2", actorName: "Jess", actorInitial: "J", summary: "{dated}", date: "2026-09-30", dateLabel: "30 Sep 2026", result: "{ref}" };

function memoryStore(initial: SavedTemplate[] = []): TemplateStore {
  let data = initial;
  return { load: () => data, save: (next) => { data = next; return true; } };
}

/** A Delivery-like editor whose Save fails while the input is empty. */
function PartnerEditor({ close }: { close: () => void }) {
  const [v, setV] = useState("");
  return (
    <>
      <input aria-label="{partner input}" value={v} onChange={(e) => setV(e.target.value)} />
      <CardEditorButtons onCancel={close} onSave={() => { if (v) close(); }} />
    </>
  );
}

const MODULES: CardModule[] = [
  { key: "info", label: "Info", opensHeaderDetails: true, summary: [{ key: "t", label: "Total", value: "{total}" }, { key: "p", label: "Paid", value: "{paid}" }, { key: "o", label: "Outstanding", value: "{outstanding}" }], items: <p>{"{order items}"}</p> },
  {
    key: "delivery", label: "Delivery",
    summary: [
      { key: "stock", label: "Stock", value: "{ready}", opensItems: true },
      { key: "logistics", label: "Logistics", value: "{partner}", editable: true, editor: (close) => <PartnerEditor close={close} /> },
      { key: "date", label: "Confirmed Delivery", value: "{date}", editable: true, editor: () => <p>{"{date editor}"}</p> },
    ],
    items: <p>{"{delivery items}"}</p>,
  },
];

function card(extra: Partial<Parameters<typeof CompactModuleCard>[0]> = {}) {
  return render(
    <CompactModuleCard
      name="{customer}"
      reference="{order}"
      phone="{phone}"
      sales={{ orderDate: "{order date}", salesLocation: "{location}", salesperson: "{salesperson}" }}
      address={{ area: "{area}", full: "{full address}" }}
      modules={MODULES}
      initialModule="info"
      communication={{ recipients: [{ value: "{customer} · +60123456789", label: "Customer", phone: "+60123456789" }], templates: [{ key: "t", label: "{template}", body: "{body}" }], store: memoryStore() }}
      timeline={[PAID, DATE_ONLY]}
      {...extra}
    />,
  );
}

describe("draftLink — opens a draft, never sends", () => {
  it("builds wa.me from a local number and refuses non-numbers", () => {
    expect(draftLink("whatsapp", "019-8337 2393", "hi")).toBe("https://wa.me/601983372393?text=hi");
    expect(draftLink("whatsapp", "not a phone", "hi")).toBe("");
  });
  it("builds mailto only for a valid address, with subject", () => {
    expect(draftLink("email", "a@b.co", "body", "Sub")).toBe("mailto:a%40b.co?subject=Sub&body=body");
    expect(draftLink("email", "a@b", "body")).toBe("");
  });
});

describe("formatCardTime — the instant is kept, no zone suffix", () => {
  it("shows day and time in Malaysia and keeps seconds in the title", () => {
    expect(formatCardTime(PAID.at as string)).toEqual({ short: "30 Sep · 4:08 PM", full: "30 Sep 2026, 4:08:32 PM" });
  });
  it("never writes MYT", () => {
    const t = formatCardTime("2026-12-31T23:59:59Z");
    expect(`${t.short} ${t.full}`).not.toMatch(/MYT|GMT|\+08/);
    expect(t.short).toBe("1 Jan · 7:59 AM");
  });
});

describe("CompactModuleCard — shared header", () => {
  it("Info opens sales facts and address; the toggle is a chevron with no visible words", () => {
    card();
    const toggle = screen.getByRole("button", { name: CARD_WORDS.orderDetails });
    expect(toggle.textContent).toBe("▴");
    expect(screen.getByText("{location}")).toBeTruthy();
    expect(screen.getByText(CARD_WORDS.salesperson)).toBeTruthy();
    expect(screen.getByText("{full address}")).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("▾");
    expect(screen.queryByText("{location}")).toBeNull();
    expect(screen.getByText("{full address}")).toBeTruthy();
  });

  it("another module starts with sales facts and address closed", () => {
    card({ initialModule: "delivery" });
    expect(screen.queryByText("{location}")).toBeNull();
    expect(screen.queryByText("{full address}")).toBeNull();
  });

  it("switching module resets header details to that module's default and closes items and editors", () => {
    card();
    fireEvent.click(screen.getByRole("button", { name: CARD_WORDS.items }));
    expect(screen.getByText("{order items}")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delivery" }));
    expect(screen.queryByText("{order items}")).toBeNull();
    expect(screen.queryByText("{location}")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    expect(screen.getByText("{location}")).toBeTruthy();
  });
});

describe("CompactModuleCard — summary and editors", () => {
  it("renders only the module's own facts, label above value", () => {
    card();
    expect(screen.getAllByText(/^\{(total|paid|outstanding)\}$/)).toHaveLength(3);
    expect(screen.queryByText("{ready}")).toBeNull();
    const total = screen.getByText("{total}").parentElement as HTMLElement;
    expect(total.firstElementChild?.textContent).toBe("Total");
  });

  it("puts the ▾ at the right of the title row and an optional status on its own line", () => {
    card({ initialModule: "delivery", modules: [{ key: "delivery", label: "Delivery", summary: [{ key: "s", label: "Stock", value: "1/1", status: "Ready", opensItems: true }, { key: "c", label: "Customer", value: "{date}", editable: true, editor: () => null }] }] });
    const stock = screen.getByRole("button", { name: /Stock/ });
    expect([...stock.querySelectorAll("strong > span")].map((e) => e.textContent)).toEqual(["1/1", "Ready"]);
    const title = screen.getByRole("button", { name: /Customer/ }).querySelector("small") as HTMLElement;
    expect(title.lastElementChild?.textContent).toBe("▾");
    expect(title.lastElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: /Customer/ }).querySelectorAll("strong > span")).toHaveLength(0);
  });

  it("shows an editor error line above Cancel and Save", () => {
    render(<CardEditorButtons onSave={() => {}} onCancel={() => {}} error="{why}" />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("{why}");
    expect(alert.nextElementSibling?.querySelectorAll("button")).toHaveLength(2);
  });

  it("opens one editor at a time", () => {
    card({ initialModule: "delivery" });
    fireEvent.click(screen.getByRole("button", { name: /Logistics/ }));
    expect(screen.getByLabelText("{partner input}")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Confirmed Delivery/ }));
    expect(screen.queryByLabelText("{partner input}")).toBeNull();
    expect(screen.getByText("{date editor}")).toBeTruthy();
  });

  it("a failed save keeps the editor and its input; a successful save folds it", () => {
    card({ initialModule: "delivery" });
    fireEvent.click(screen.getByRole("button", { name: /Logistics/ }));
    fireEvent.click(screen.getByRole("button", { name: CARD_WORDS.save }));
    const input = screen.getByLabelText("{partner input}") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "NETS" } });
    fireEvent.click(screen.getByRole("button", { name: CARD_WORDS.cancel }));
    fireEvent.click(screen.getByRole("button", { name: /Logistics/ }));
    fireEvent.change(screen.getByLabelText("{partner input}"), { target: { value: "NETS" } });
    fireEvent.click(screen.getByRole("button", { name: CARD_WORDS.save }));
    expect(screen.queryByLabelText("{partner input}")).toBeNull();
  });

  it("Stock opens the module's items instead of an editor", () => {
    card({ initialModule: "delivery" });
    fireEvent.click(screen.getByRole("button", { name: /Stock/ }));
    expect(screen.getByText("{delivery items}")).toBeTruthy();
  });
});

describe("CompactModuleCard — Communication and Timeline", () => {
  it("keeps Items, Communication and Timeline closed by default", () => {
    card();
    expect(screen.queryByText("{order items}")).toBeNull();
    expect(screen.queryByText(CARD_WORDS.communication, { selector: "h2" })).toBeNull();
    expect(screen.queryByText(CARD_WORDS.timeline, { selector: "h2" })).toBeNull();
  });

  it("Email alone shows Subject; channel sits in the Communication header", () => {
    card({ initiallyOpen: { communication: true } });
    expect(screen.queryByLabelText(CARD_WORDS.subject)).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: CARD_WORDS.channel }), { target: { value: "email" } });
    expect(screen.getByLabelText(CARD_WORDS.subject)).toBeTruthy();
  });

  it("Escape and an outside press close the ⋯ menu; Escape returns focus to ⋯", () => {
    card({ initiallyOpen: { communication: true } });
    const more = screen.getByRole("button", { name: CARD_WORDS.messageOptions });
    fireEvent.click(more);
    expect(screen.getByRole("button", { name: CARD_WORDS.findTemplate })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: CARD_WORDS.findTemplate })).toBeNull();
    expect(document.activeElement).toBe(more);
    fireEvent.click(more);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("button", { name: CARD_WORDS.findTemplate })).toBeNull();
  });

  it("refuses a duplicate template name", () => {
    const store = memoryStore([{ id: "1", name: "Same", body: "b", audience: "Everyone" }]);
    card({ initiallyOpen: { communication: true }, communication: { recipients: [], templates: [], store } });
    fireEvent.change(screen.getByPlaceholderText(CARD_WORDS.messagePlaceholder), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: CARD_WORDS.messageOptions }));
    fireEvent.click(screen.getByRole("button", { name: CARD_WORDS.saveAsTemplate }));
    fireEvent.change(screen.getByLabelText(CARD_WORDS.name), { target: { value: "same" } });
    fireEvent.click(screen.getByRole("button", { name: CARD_WORDS.save, hidden: true }));
    expect(screen.getByText(CARD_WORDS.nameUsed)).toBeTruthy();
  });

  it("shows a recorded instant without MYT and keeps the full instant", () => {
    card({ initiallyOpen: { timeline: true } });
    const item = screen.getByText("{payment}").closest("li") as HTMLElement;
    const time = within(item).getByText("30 Sep · 4:08 PM");
    expect(time.getAttribute("datetime")).toBe(PAID.at);
    expect(time.getAttribute("title")).toBe("Recorded 30 Sep 2026, 4:08:32 PM");
    expect(item.textContent).not.toMatch(/MYT/);
    expect(within(item).queryByText(/Time unavailable/)).toBeNull();
  });

  it("states a missing time instead of inventing one", () => {
    card({ initiallyOpen: { timeline: true } });
    const item = screen.getByText("{dated}").closest("li") as HTMLElement;
    expect(within(item).getByText("30 Sep 2026").tagName).toBe("TIME");
    expect(within(item).getByText(`· ${CARD_WORDS.timeUnavailable}`)).toBeTruthy();
    expect(item.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("shows the actor as an avatar with the name in its label", () => {
    card({ initiallyOpen: { timeline: true } });
    expect(screen.getAllByLabelText(CARD_WORDS.recordedBy("Jess"))[0].textContent).toBe("J");
  });
});
