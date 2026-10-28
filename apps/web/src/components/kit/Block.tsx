/**
 * Block — the ONE card (ONE KIT LAW, owner ruling 2026-09-27; admitted to the
 * kit with the Work page, Jess 2026-09-28 "kit ok"). It was born on the Sales
 * Order page and every page that draws a card imports it from here: Sales
 * Order, Purchase Orders, Manual Purchase, Purchasing's review and settings
 * cards, the Warehouse Unit and Workspace.
 *
 * One chrome (owner instruction 2026-09-26, "follow sales order ui kit … every
 * page of purchasing"), drawn in v4 values (01 §3, 9 Oct 2026): white, 1px
 * `--c-card-border`, 8px corner, no shadow, 14 × 16 padding, a 15 / 600 ink
 * title over a 1px `--c-section-line` rule. Never a box inside a box.
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
  /* ⭐ ONE CHROME FOR EVERY OBJECT / DETAIL / REVIEW CARD — owner instruction
     (Jess, 2026-09-26): "follow sales order ui kit … every page of
     purchasing". The blue title over a 1px rule (owner ruling 2026-09-21/22)
     is no longer the Sales Order page's opt-in; the former `shared` tone — a
     mono UPPERCASE title beside a left band — is RETIRED. Purchase Orders,
     Manual Purchase, the Review Purchase Orders pane, Supplier Claims and
     Purchasing Settings draw this same card. */
  tone,
  note,
  headerSlot,
  subtitle,
  summary,
  forceOpen,
  why,
  children,
}: {
  title: string;
  /** Quiet summary identity surface, on the v4 neutral grey. */
  tone?: "muted";
  /** ⭐ THE WORK ROUTE CARD'S SECOND LINE (Workspace MASTER §5.10 BUILD SHEET,
   *  Jess 2026-09-28): under the title, inside the header, 13/400 — red when
   *  missed, amber when due, else grey. It says WHY the card is here. */
  why?: { text: string; tone: "missed" | "due" | "none" } | null;
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
    <section className={`rounded-lg border border-c-card-border ${tone === "muted" ? "bg-c-info-bg" : "bg-c-card"} [padding:var(--card-pad)]`} data-block={title}>
      {/* ⭐ ONE CARD, ONE CHROME — every page draws its cards from here.
          A white card with a 1px rule under the title; the title is
          `text-strong` slate-12 BLACK bold, sentence case (ONE KIT LAW, Jess
          2026-09-27, which overwrote the 2026-09-21 "remain blue" ruling).
          Blue stays for the primary button, links and selection only. There
          is no second tone and no band: the grey band and the mono uppercase
          heading are retired. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-c-section-line pb-2">
        {/* ONE KIT LAW (Jess, 2026-09-27): the card title is BLACK bold
            `text-strong` slate-12 — never blue (blue is the primary button,
            links and selection only), never a band. Overwrites the
            2026-09-21 "remain blue" ruling in the one place every page draws from. */}
        <h2 id={headingId} className="text-strong text-c-ink">
          {title}
        </h2>
        {headerSlot}
        {note && <span className="text-meta font-normal text-c-secondary">{note}</span>}
        {why ? (
          <p
            className={`basis-full text-body ${why.tone === "missed" ? "text-c-err-fg" : why.tone === "due" ? "text-c-warn-fg" : "text-c-secondary"}`}
            data-testid={`block-why-${title}`}
          >
            {why.text}
          </p>
        ) : null}
      </div>
      {subtitle && (
        <p className="mt-1 text-meta font-normal text-c-secondary" data-testid={`block-subtitle-${title}`}>
          {subtitle}
        </p>
      )}
      {collapsible && !isOpen ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={bodyId}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-body text-c-body hover:bg-c-hover"
          data-testid={`block-expand-${title}`}
        >
          <span className="text-c-muted">▸</span>
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
              className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1 text-left text-meta text-c-secondary hover:bg-c-hover disabled:cursor-not-allowed disabled:opacity-50"
              data-testid={`block-collapse-${title}`}
              title={forceOpen ? "This section has unsaved changes" : undefined}
            >
              <span className="text-c-muted">▾</span>
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
          <div id={bodyId} className="mt-3 flex flex-col gap-3 [&>*:empty]:hidden">
            {children}
          </div>
        </>
      )}
    </section>
  );
}
