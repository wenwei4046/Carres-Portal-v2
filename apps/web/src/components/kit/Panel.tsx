/**
 * Panel — a Card that has a title (UI-KIT §6, card D0.5a).
 *
 * The difference from `Card` is one question: does this surface need to say
 * what it is? If yes it is a Panel and the title is a real element with a real
 * type token; if no it is a Card and nothing is drawn. Two components rather
 * than an optional `title` prop, so a page cannot half-title a card.
 *
 * The header is separated by §3.2's STRONGER divider (`slate-6`) — that step
 * exists for exactly this, a split inside one surface, while `slate-5` stays
 * the outer hairline.
 *
 * **It does not collapse.** A collapsible panel is behaviour and D0.5a ships
 * none; the existing `SectionBand` keeps that job until D0.5b/D0.5c replace it.
 * `right` is a slot, not a menu: the caller passes a Button or a StatusPill.
 */
import type { ReactNode } from "react";

export default function Panel({
  title,
  right,
  padding = "normal",
  children,
}: {
  title: string;
  /** One control at the header's right edge — a count, a pill, a Button. */
  right?: ReactNode;
  padding?: "normal" | "none";
  children: ReactNode;
}) {
  return (
    <section data-kit="panel" className="bg-white border border-kit-slate-5 rounded-card">
      <header className="flex items-center justify-between gap-4 border-b border-kit-slate-6 px-4 py-3">
        <h2 className="text-strong text-kit-slate-12 truncate">{title}</h2>
        {right}
      </header>
      <div className={padding === "normal" ? "p-4" : ""}>{children}</div>
    </section>
  );
}
