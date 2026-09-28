/**
 * Block — the ONE card (ONE KIT LAW, owner ruling 2026-09-27; admitted to the
 * kit with the Work page, Jess 2026-09-28 "kit ok"). It was born on the Sales
 * Order page and every page that draws a card imports it from here: Sales
 * Order, Purchase Orders, Manual Purchase, the Warehouse Unit and Workspace.
 *
 * The `sales-order` tone is the kit card: white, 1px `slate-5`, radius 6,
 * 12/16 padding, a black `text-strong` title over a 1px rule.
 */
import { useState } from "react";

/**
 * A left-pane block. The bar beside the title is the section's whole chrome —
 * §6.4 ④ ruled the panel CALM: sections, not a box around every field.
 *
 * **The bar is GREY, and that is a token law, not taste.**
 * `../../01-design-tokens.md` §2.2 is frozen: *"Blue appears ONCE on a screen —
 * on the primary button."* Eight blue rules down the left of one form would
 * spend the accent eight times and leave nothing to mark the current thing.
 * The tab underline above already holds the screen's one accent.
 */
export default function Block({
  title,
  /** ⭐ THE BLUE TITLE IS THE SALES ORDER PAGE'S, NOT EVERY PAGE'S. `Block` is
   *  shared — `PurchaseOrdersPage` draws its object with the same card — and the
   *  owner ruling that made the title blue (Jess, 2026-09-21/22) is a SALES
   *  ORDER ruling. So the blue is opt-in and the shared default is unchanged;
   *  no other page moves. */
  titleTone = "shared",
  note,
  headerSlot,
  subtitle,
  summary,
  forceOpen,
  why,
  children,
}: {
  title: string;
  /** ⭐ THE WORK ROUTE CARD'S SECOND LINE (Workspace MASTER §5.10 BUILD SHEET,
   *  Jess 2026-09-28): under the title, inside the header, 13/400 — red when
   *  missed, amber when due, else grey. It says WHY the card is here. */
  why?: { text: string; tone: "missed" | "due" | "none" } | null;
  titleTone?: "shared" | "sales-order";
  note?: string;
  /** ⭐ A STANDING FACT ABOUT THE WHOLE CARD BELONGS BESIDE ITS NAME
   *  (Jess, 2026-08-26). `note` is prose; this slot takes a rendered chip, so a
   *  fact the reader wants BEFORE reading the fields — is this a new customer or
   *  one we already have — is answered by the heading rather than by a row eight
   *  fields down.
   *
   *  ⭐ AND A READ-ONLY DOOR MAY RIDE HERE TOO (YH, 2026-09-01). The original
   *  rule read "a fact, never a control: nothing in here writes", and the
   *  second half of that sentence is the part that matters. A door that only
   *  NAVIGATES writes nothing — it is the Law C escape hatch, not a form — and
   *  a whole bordered row at the bottom of a card to hold one link is the
   *  "extra row for one control" this page has been removing all week.
   *  ⛔ STILL NEVER A WRITER. Nothing mounted here may submit, decide, or
   *  change a record; a control that writes belongs beside the fact it
   *  changes, where the reader can see what it will move. */
  headerSlot?: React.ReactNode;
  /** ⭐ WHAT THIS BLOCK IS FOR, in the operator's words (2026-08-24).
   *
   *  Jess's objective is that someone who does not know ERP can work this page
   *  without asking what a section means. The block TITLES are locked words
   *  (COPY-STANDARD "Use exactly", and MASTER.md's SALES ORDER OBJECT PAGE V2
   *  names them in its block order), so the answer is not to rename them — it
   *  is to EXPLAIN them. A subtitle teaches; a new noun would only move the
   *  confusion somewhere else. */
  subtitle?: string;
  /** One line standing in for the whole block while collapsed. Passing this is
   *  what makes a block collapsible at all — a block with no honest one-line
   *  summary must stay open, because a chevron hiding an unknown is worse than
   *  a card the reader can simply see. */
  summary?: string;
  /** ⭐ NEVER HIDE AN UNSAVED CHANGE. The dark save bar says `⚠ {n} changes`;
   *  if one of those changes sat inside a collapsed block the operator would be
   *  told something changed with no way to find it. A dirty block force-opens
   *  and cannot be closed until it is saved or discarded. */
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const collapsible = Boolean(summary);
  const [open, setOpen] = useState(false);
  const isOpen = !collapsible || open || Boolean(forceOpen);
  const headingId = `block-h-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const bodyId = `block-b-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <section className="rounded-card border border-kit-slate-5 bg-white px-4 py-3" data-block={title}>
      {/* ⭐ THE CARD TITLE IS BLUE, SENTENCE CASE, OVER A 1px RULE — OWNER
          RULING (Jess, 2026-09-21), re-affirmed 2026-09-22: **"remain blue"**,
          kept after the challenge that blue elsewhere means clickable
          (`docs/orders/MASTER.md` § "Order view — one page, foreign facts
          read-only" → CARD ORDER AND NAMES).

          Two ranks only: card title `text-strong` 15px/600 sentence case in
          `kit-blue-11`, on a WHITE card with a 1px rule; the in-card label is
          13px/600 slate-11.

          ⛔ WHAT THIS RETIRES: the mono UPPERCASE `text-signature-700` heading
          and the `border-l-2` blue-grey band beside it. Both were this page's
          own 2026-08-24/28 answers to "a section must read as a section"; the
          owner has since ruled the answer, so the older reasoning is removed
          rather than left beside it to be re-argued. */}
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${
          titleTone === "sales-order" ? "border-b border-kit-slate-5 pb-2" : "border-l-2 border-base-300 pl-2"
        }`}
      >
        <h2
          id={headingId}
          className={
            titleTone === "sales-order"
              ? /* ONE KIT LAW (owner ruling 2026-09-27): a card title is black bold,
                   never blue. It overwrites the 2026-09-21 "remain blue" ruling. */
                "text-strong text-kit-slate-12"
              : "font-mono text-strong uppercase tracking-[0.08em] text-signature-700"
          }
        >
          {title}
        </h2>
        {headerSlot}
        {note && <span className="text-meta font-normal text-base-600">{note}</span>}
        {why ? (
          <p
            className={`basis-full text-body ${why.tone === "missed" ? "text-kit-red-11" : why.tone === "due" ? "text-kit-amber-11" : "text-kit-slate-11"}`}
            data-testid={`block-why-${title}`}
          >
            {why.text}
          </p>
        ) : null}
      </div>
      {subtitle && (
        <p className="mt-1 text-meta font-normal text-base-500" data-testid={`block-subtitle-${title}`}>
          {subtitle}
        </p>
      )}
      {collapsible && !isOpen ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={bodyId}
          className="mt-2 flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-body text-base-600 hover:bg-hovertint"
          data-testid={`block-expand-${title}`}
        >
          <span className="text-base-400">▸</span>
          <span className="min-w-0 flex-1 truncate">{summary}</span>
        </button>
      ) : (
        <>
          {collapsible && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              /* A dirty block cannot be closed — the change must stay findable. */
              disabled={Boolean(forceOpen)}
              aria-expanded
              aria-controls={bodyId}
              className="mt-2 flex items-center gap-2 rounded-control px-2 py-1 text-left text-meta text-base-500 hover:bg-hovertint disabled:cursor-not-allowed disabled:opacity-50"
              data-testid={`block-collapse-${title}`}
              title={forceOpen ? "This section has unsaved changes" : undefined}
            >
              <span className="text-base-400">▾</span>
              <span>{forceOpen ? "Unsaved changes here" : "Hide"}</span>
            </button>
          )}
          {/* ⭐ ONE GAP BETWEEN THE GROUPS OF A SECTION (SO page kit-sizes
              card, 2026-09-23). Each SO section used to space its own field
              groups — `mt-3` here, `mt-4` there, none at all between Delivery's
              address and its access fields (measured 0px). The body now owns
              it: 12px (`gap-3`, the standard gap) between every group, and a
              group that renders nothing takes no gap. Children carry no top
              margin of their own. Opt-in with the SO tone because Purchase
              Orders and Manual Purchase share this component and space their
              own bodies. */}
          <div
            id={bodyId}
            className={titleTone === "sales-order" ? "mt-3 flex flex-col gap-3 [&>*:empty]:hidden" : "mt-3"}
          >
            {children}
          </div>
        </>
      )}
    </section>
  );
}
