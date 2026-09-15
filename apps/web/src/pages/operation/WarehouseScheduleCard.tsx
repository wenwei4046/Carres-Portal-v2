/**
 * WAREHOUSE SCHEDULE — one card, one dated piece of physical work.
 *
 * A Warehouse-LOCAL composition (owner authorisation 2026-09-14). It is built
 * from kit primitives — `StatusPill`, `Icon`, `Tooltip`, the kit tone and type
 * tokens — but it is deliberately NOT a shared Schedule template and must not
 * become one before Jess has reviewed it deployed.
 *
 * THE CARD HAS NO FOOTER AND NO ACTION. The open control is a DOOR: it opens
 * receiving or loading work already filtered to this record. It never posts a
 * receipt, a loading result, a driver acceptance or a stock change — a card
 * that could complete work would let an operator finish a job from a summary
 * they cannot see the goods from.
 *
 * Field order is fixed, and each line earns its place:
 *   1 · the party, its date agreement, and the door
 *   2 · the source references
 *   3 · the special movement label — only when the movement IS special
 *   4 · EVERY original product line, never merged and never capped
 *   5 · exception and related-record facts, only where evidence exists
 */
import { Link } from "react-router-dom";
import Icon from "@/components/kit/Icon";
import StatusPill from "@/components/kit/StatusPill";
import Tooltip from "@/components/kit/Tooltip";
import type { WarehouseScheduleCard as ScheduleCard } from "@carres/shared";
import {
  cardReferencesOf,
  cardSurfaceClassOf,
  categoryVisualOf,
  dateStatusPillOf,
  exceptionLinesOf,
  extraRelatedRecordsOf,
  lineProgressOf,
  specialMovementLabelOf,
  type CardReference,
  type LineProgress,
} from "./warehouse-schedule-view";

/** §3.3's ink steps, for the one place a tone is NOT rendered as a pill. */
const EXCEPTION_INK: Record<string, string> = {
  danger: "text-kit-red-11",
  warning: "text-kit-amber-11",
  neutral: "text-kit-slate-11",
  info: "text-kit-blue-11",
  success: "text-kit-green-11",
};

export default function WarehouseScheduleCard({ card }: { card: ScheduleCard }) {
  const refs = cardReferencesOf(card);
  const pill = dateStatusPillOf(card.dateStatus);
  const special = specialMovementLabelOf(card.kind);
  const exceptions = exceptionLinesOf(card);
  const extraRelated = extraRelatedRecordsOf(card);
  const party = card.partyName ?? "Party not recorded";

  return (
    <article
      data-testid={`ws-card-${card.id}`}
      data-direction={card.direction}
      /* 1px border · 10px corner · NO decorative shadow. The surface says one
         thing only, and it is not date agreement: `overdue`. */
      className={`min-w-0 rounded-card border ${cardSurfaceClassOf(card)}`}
      aria-label={`${party} · ${refs.primary.ref}`}
    >
      {/* ── 1 · HEADER — 8px/12px padding, 4px gaps, and it WRAPS.
             A long party name or a long reference must push the door onto the
             next line, never be clipped: the operator identifies the work by
             exactly the characters a truncation would eat. */}
      {/* The hairline under the header is what gives the card a head and a
          body once the surface is white — without a tint doing that job, the
          party and the references ran together as one block. */}
      <header className="flex flex-wrap items-center gap-1 border-b border-kit-slate-5 px-3 py-2">
        {/* `flex-[1_1_6rem]` rather than `flex-1`: the name keeps a readable
            floor, so in a narrow date column the PILL AND DOOR wrap to the
            next line as a unit instead of the party name being squeezed into
            a two-character gutter. The name is the identity — it gets the
            room, and nothing is ever clipped. */}
        {card.detailHref ? (
          <Link
            to={card.detailHref}
            className="min-w-0 flex-[1_1_6rem] break-words [overflow-wrap:anywhere] text-body font-semibold leading-5 text-kit-slate-12 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-blue-9"
            data-testid="ws-card-party"
          >
            {party}
          </Link>
        ) : (
          <span
            className="min-w-0 flex-[1_1_6rem] break-words [overflow-wrap:anywhere] text-body font-semibold leading-5 text-kit-slate-12"
            data-testid="ws-card-party"
          >
            {party}
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {/* The pill comes BEFORE the door — the operator reads what kind of
              date this is, then decides whether to walk into the work. */}
          {pill && (
            <span data-testid="ws-card-date-status">
              <StatusPill tone={pill.tone}>{pill.word}</StatusPill>
            </span>
          )}
          <OpenWorkControl card={card} party={party} sourceRef={refs.primary.ref} />
        </span>
      </header>

      <div className="px-3 pb-3 pt-2">
        {/* ── 2 · SOURCE REFERENCES — each on its own line, each ONCE, each
               still openable. The link rides on the reference itself rather
               than on a repeat of it further down the card. */}
        <div className="min-w-0">
          {/* `anywhere` rather than `break-word`: a PO number is one long
              unbroken token, so plain wrapping leaves it overflowing its own
              column at six-column width. Size and weight are untouched. */}
          <div
            className="break-words [overflow-wrap:anywhere] text-body font-semibold leading-5 text-kit-slate-12"
            data-testid="ws-card-ref-primary"
          >
            <ReferenceText reference={refs.primary} />
          </div>
          {refs.secondary && (
            <div
              className="break-words [overflow-wrap:anywhere] text-label leading-4 text-kit-slate-11"
              data-testid="ws-card-ref-secondary"
            >
              <ReferenceText reference={refs.secondary} />
            </div>
          )}
        </div>

        {/* ── 3 · SPECIAL MOVEMENT — absent for an ordinary arrival or pickup,
               because a heading repeated on every card in the column is the
               repetition the owner removed. */}
        {special && (
          <div className="mt-1">
            <span
              className="inline-block rounded-full bg-white/70 px-1.5 py-0.5 text-label text-kit-slate-11"
              data-testid="ws-card-special"
            >
              {special}
            </span>
          </div>
        )}

        {/* ── 4 · EVERY ORIGINAL PRODUCT LINE. No `+N more`, no SKU
               aggregation, no category total standing in for the lines, no
               maximum — a line the operator must physically handle is a line
               they must be able to read. */}
        {card.lines.length > 0 && (
          <ul className="mb-2 mt-1" data-testid="ws-card-lines">
            {card.lines.map((line) => (
              <ProductRow key={line.id} line={line} direction={card.direction} />
            ))}
          </ul>
        )}

        {/* ── 5 · EVIDENCE-BACKED EXCEPTIONS. Each is its own line: damage is
               never folded into progress, and the driver's count is never
               folded into the warehouse's. */}
        {exceptions.length > 0 && (
          <div className="flex flex-col gap-0.5" data-testid="ws-card-exceptions">
            {exceptions.map((e) => (
              <p
                key={e.key}
                className={`text-meta leading-[18px] ${EXCEPTION_INK[e.tone] ?? EXCEPTION_INK.neutral}`}
                data-testid={`ws-card-exception-${e.key}`}
              >
                {e.text}
              </p>
            ))}
          </div>
        )}

        {extraRelated.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-2" data-testid="ws-card-related">
            {extraRelated.map((r) => (
              <Link
                key={r.id}
                to={r.href}
                className="text-meta leading-[18px] text-kit-blue-11 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-blue-9"
              >
                {r.ref}
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** A reference — a link when the projection gave it one, plain text otherwise. */
function ReferenceText({ reference }: { reference: CardReference }) {
  if (!reference.href) return <>{reference.ref}</>;
  return (
    <Link
      to={reference.href}
      className="underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-blue-9"
    >
      {reference.ref}
    </Link>
  );
}

/**
 * The door into receiving / loading work — 28px hit area, an 18px glyph, and
 * BOTH a tooltip and an accessible name, because the glyph alone says nothing
 * to a screen reader and nothing on a touch screen.
 *
 * When the projection supplies no `openHref` there is no scope to open. It
 * renders NOTHING rather than linking somewhere adjacent: a door into the
 * wrong record is worse than no door, and a disabled-looking control invites
 * the operator to keep pressing it.
 */
function OpenWorkControl({
  card,
  party,
  sourceRef,
}: {
  card: ScheduleCard;
  party: string;
  sourceRef: string;
}) {
  if (!card.openHref) return null;
  const word = card.direction === "arrival" ? "Open receiving work" : "Open loading work";
  const label = `${word} for ${party} · ${sourceRef}`;
  return (
    <Tooltip content={word}>
      <Link
        to={card.openHref}
        aria-label={label}
        data-testid="ws-card-open"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-kit-slate-11 hover:bg-white/70 hover:text-kit-slate-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-blue-9"
      >
        <Icon name="open" size={18} />
      </Link>
    </Tooltip>
  );
}

/**
 * ONE original product line: category slot · model · progress.
 *
 * 36px minimum height so a row stays a touch target, a subtle divider between
 * rows and none after the last, and the progress right-aligned in tabular
 * numerals so a column of counts reads as a column.
 */
function ProductRow({
  line,
  direction,
}: {
  line: ScheduleCard["lines"][number];
  direction: ScheduleCard["direction"];
}) {
  const visual = categoryVisualOf(line.categoryKey);
  const progress = lineProgressOf(line, direction);
  return (
    <li
      className="flex min-h-9 items-center gap-2 border-b border-kit-slate-5 py-1.5 last:border-b-0"
      data-testid="ws-line"
    >
      {/* 24px slot, 18px glyph centred in it. The glyph never enlarges and the
          category is never guessed from the model text — an unstated category
          renders the neutral glyph and claims nothing. */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-kit-slate-11">
        <Icon name={visual.glyph} size={18} title={visual.word ?? undefined} />
      </span>
      {/* A wrapped model name gets its lines apart; the 12px size stays. */}
      <span
        className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-meta leading-[17px] text-kit-slate-12"
        data-testid="ws-line-model"
      >
        {line.modelLabel ?? "Model not recorded"}
      </span>
      <ProgressFigure progress={progress} />
    </li>
  );
}

/**
 * The progress figure — number first in the reading order that matters, symbol
 * beside it, and the MEANING carried in text for the screen reader.
 *
 * The three states are visually distinct on purpose:
 *   · an absent record → the planned quantity ALONE, no symbol, grey
 *   · a recorded zero  → `0/N` against an empty grey ring
 *   · partial / complete → `n/N` amber, `N/N` green check
 *
 * The empty ring is drawn rather than iconised because the kit has no circle
 * glyph and this task may not expand the icon kit.
 */
function ProgressFigure({ progress }: { progress: LineProgress }) {
  const ink =
    progress.tone === "warning"
      ? "text-kit-amber-11"
      : progress.tone === "success"
        ? "text-kit-green-11"
        : "text-kit-slate-11";
  return (
    <span
      className={`flex shrink-0 items-center gap-1 ${ink}`}
      data-testid="ws-line-progress"
      data-state={progress.state}
    >
      <span className="text-meta tabular-nums text-right" title={progress.status}>
        {progress.text}
      </span>
      {/* The symbol slot is ALWAYS 14px, even when there is no symbol to draw.
          Collapsing it would let `3` end where `12/12` starts, and a column of
          counts that do not line up is a column an operator has to read one
          row at a time. */}
      <span
        aria-hidden="true"
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center"
      >
        {progress.state === "none" && (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-kit-slate-9" />
        )}
        {progress.state === "partial" && <Icon name="waiting" size={14} />}
        {progress.state === "complete" && <Icon name="ready" size={14} />}
      </span>
      {/* The numbers alone do not say `received` or `loaded`. This does. */}
      <span className="sr-only">{progress.status}</span>
    </span>
  );
}
