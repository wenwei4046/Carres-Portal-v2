/**
 * CompactModuleCard — the confirmed reference's interaction contract
 * (UI MASTER §4.3). Pixel parity is proven separately by
 * scripts/compact-card-parity.mjs and scripts/compact-card-states.mjs.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CompactModuleCard, { CARD_WORDS, draftLink, type CardTimelineEvent, type SavedTemplate, type TemplateStore } from "./CompactModuleCard";

const EVENT: CardTimelineEvent = { id: "e1", actorName: "Jess", actorInitial: "J", summary: "Payment received · RM1,380", date: "2026-09-30", dateLabel: "30 Sep 2026", timeLabel: null, result: "RC3009263735" };

function memoryStore(initial: SavedTemplate[] = []): TemplateStore {
  let data = initial;
  return { load: () => data, save: (next) => { data = next; return true; } };
}

function card(extra: Partial<Parameters<typeof CompactModuleCard>[0]> = {}) {
  return render(
    <CompactModuleCard
      name="{customer}"
      reference="{order}"
      phone="{phone}"
      modules={[{ key: "info", label: "Info", disabled: true }, { key: "delivery", label: "Delivery" }]}
      currentModule="delivery"
      facts={[
        { key: "stock", label: "Stock", value: "{ready}", opensItems: true },
        { key: "logistics", label: "Logistics", value: "{partner}", editable: true, editor: (close) => <button type="button" onClick={close}>{"{editor}"}</button> },
      ]}
      items={<p>{"{items}"}</p>}
      communication={{ recipients: [{ value: "{customer} · +60123456789", label: "Customer", phone: "+60123456789" }], templates: [{ key: "t", label: "{template}", body: "{body}" }], store: memoryStore() }}
      timeline={[EVENT]}
      {...extra}
    />,
  );
}

describe("draftLink — opens a draft, never sends", () => {
  it("builds wa.me from a local number and refuses non-numbers", () => {
    expect(draftLink("whatsapp", "019-8337 2393", "hi")).toBe("https://wa.me/601983372393?text=hi");
    expect(draftLink("whatsapp", "not a phone", "hi")).toBe("");
  });
  it("maps a chosen contact to its phone", () => {
    expect(draftLink("whatsapp", "A · +60123456789", "x", "", { "A · +60123456789": "+60123456789" })).toBe("https://wa.me/60123456789?text=x");
  });
  it("builds mailto only for a valid address, with subject", () => {
    expect(draftLink("email", "a@b.co", "body", "Sub")).toBe("mailto:a%40b.co?subject=Sub&body=body");
    expect(draftLink("email", "a@b", "body")).toBe("");
  });
});

describe("CompactModuleCard", () => {
  it("keeps Communication, items and Timeline closed until their header icons are pressed", () => {
    card();
    expect(screen.queryByText(CARD_WORDS.communication, { selector: "h2" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: CARD_WORDS.communication }));
    expect(screen.getByText(CARD_WORDS.communication, { selector: "h2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show delivery items" }));
    expect(screen.getByText("{items}")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: CARD_WORDS.showTimeline }));
    expect(screen.getByText(CARD_WORDS.timeline, { selector: "h2" })).toBeTruthy();
  });

  it("opens one inline editor per fact and folds it on close", () => {
    card();
    const cell = screen.getByRole("button", { name: /Logistics/ });
    fireEvent.click(cell);
    expect(cell.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByText("{editor}"));
    expect(screen.queryByText("{editor}")).toBeNull();
  });

  it("Stock opens the item list instead of an editor", () => {
    card();
    fireEvent.click(screen.getByRole("button", { name: /Stock/ }));
    expect(screen.getByText("{items}")).toBeTruthy();
  });

  it("puts the channel in the Communication header and shows Subject for Email only", () => {
    card({ initiallyOpen: { communication: true } });
    expect(screen.queryByLabelText(CARD_WORDS.subject)).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: CARD_WORDS.channel }), { target: { value: "email" } });
    expect(screen.getByLabelText(CARD_WORDS.subject)).toBeTruthy();
    expect(screen.getByRole("button", { name: CARD_WORDS.openEmail })).toBeTruthy();
  });

  it("enables Open WhatsApp only for a usable recipient", () => {
    card({ initiallyOpen: { communication: true } });
    const open = screen.getByRole("button", { name: CARD_WORDS.openWhatsApp }) as HTMLButtonElement;
    expect(open.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(CARD_WORDS.to), { target: { value: "{customer} · +60123456789" } });
    expect(open.disabled).toBe(false);
  });

  it("keeps template actions behind Message ⋯", () => {
    card({ initiallyOpen: { communication: true } });
    expect(screen.queryByRole("button", { name: CARD_WORDS.findTemplate })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: CARD_WORDS.messageOptions }));
    for (const w of [CARD_WORDS.findTemplate, CARD_WORDS.saveAsTemplate, CARD_WORDS.manageTemplates]) expect(screen.getByRole("button", { name: w })).toBeTruthy();
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

  it("shows the actor as an avatar and never invents a missing time", () => {
    card({ initiallyOpen: { timeline: true } });
    expect(screen.getByLabelText(CARD_WORDS.recordedBy("Jess")).textContent).toBe("J");
    const item = screen.getByText(EVENT.summary).closest("li") as HTMLElement;
    expect(within(item).getByText("30 Sep 2026").tagName).toBe("TIME");
    expect(within(item).getByText(`· ${CARD_WORDS.timeUnavailable}`)).toBeTruthy();
    expect(item.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("shows a recorded time beside the date", () => {
    card({ initiallyOpen: { timeline: true }, timeline: [{ ...EVENT, timeLabel: "2:05 pm MYT" }] });
    expect(screen.getByText("30 Sep 2026, 2:05 pm MYT")).toBeTruthy();
    expect(screen.queryByText(`· ${CARD_WORDS.timeUnavailable}`)).toBeNull();
  });
});
