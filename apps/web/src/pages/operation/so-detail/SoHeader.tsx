/**
 * The Sales Order object header, on the canvas (no white band) — Layout
 * Standard §3.2, owner-confirmed handoff 2026-10-08:
 *
 *   (←)  SO-1319              [Open]  Team (SA)(SC)  [⟲ Rev 2]
 *        Customer name
 *                    [Log contact] [Request amendment] (⋮) │ [Tasks 5]
 *
 * `Request amendment` is the ONE charcoal button. Everything else this order
 * can do lives in `⋮` More actions. The shell already titles the page
 * `Sales Order / Outright`, so no second page title is drawn here.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MIcon from "@/components/carres/MIcon";
import CPill, { type CPillTone } from "@/components/carres/CPill";
import { TasksPill } from "../components/ShellTasks";
import { Avatar, CBtn, PopMenu, type MenuItem, type Person } from "./ui";

export default function SoHeader({
  identity,
  customer,
  status,
  team,
  revLabel,
  onOpenRevisions,
  backTo,
  onBack,
  onLogContact,
  onRequestAmendment,
  amendDisabled,
  amendTitle,
  menu,
  docTitle,
}: {
  identity: string;
  customer: string | null;
  status: { word: string; tone: CPillTone } | null;
  team: Person[];
  /** `Rev 2` — present only once the order has a version after the original. */
  revLabel: string | null;
  onOpenRevisions: () => void;
  backTo: string;
  onBack: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onLogContact: () => void;
  onRequestAmendment: () => void;
  amendDisabled: boolean;
  amendTitle?: string;
  menu: ReadonlyArray<{ heading: string; items: MenuItem[] }>;
  docTitle: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    document.title = docTitle;
    return () => {
      document.title = "Carres Portal";
    };
  }, [docTitle]);
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3" data-testid="sales-order-tabs" data-kit="so-object-header">
        <Link
          to={backTo}
          onClick={onBack}
          aria-label="Back to Sales Orders"
          title="Back to Sales Orders"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-c-card text-c-body hover:bg-c-hover focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:-2px]"
          data-testid="so-back"
        >
          <MIcon name="arrow_back" size={20} />
        </Link>
        <div className="flex min-w-0 flex-col leading-[1.25]" data-testid="object-header-identity">
          <span className="text-[20px] font-medium tracking-[-.01em] text-c-ink" data-testid="object-identity">
            {identity}
          </span>
          {customer && (
            <span className="truncate text-[13px] text-c-secondary" data-testid="object-identity-customer" title={customer}>
              {customer}
            </span>
          )}
        </div>
        {status && (
          <span data-testid="object-identity-status">
            <CPill tone={status.tone} strong>
              {status.word}
            </CPill>
          </span>
        )}
        {team.length > 0 && (
          <span className="flex items-center gap-1.5 text-[12px] text-c-secondary" data-testid="so-team">
            Team
            <span className="flex">
              {team.map((p, i) => (
                <span key={p.userId} className="relative" style={{ marginLeft: i === 0 ? 0 : -6, zIndex: team.length - i }}>
                  <Avatar person={p} size={24} />
                </span>
              ))}
            </span>
          </span>
        )}
        {revLabel && (
          <button
            type="button"
            onClick={onOpenRevisions}
            title="Revision history"
            data-testid="so-rev"
            className="flex h-6 items-center gap-1 rounded-lg border border-c-btn-border bg-c-card px-2.5 text-[12px] font-semibold text-c-ink hover:bg-c-hover focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:-2px]"
          >
            <MIcon name="history" size={16} />
            {revLabel}
          </button>
        )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2" data-testid="object-header-actions">
        <CBtn kind="header" icon="add_call" onClick={onLogContact} data-testid="so-log-contact">
          Log contact
        </CBtn>
        <CBtn
          kind="main"
          onClick={onRequestAmendment}
          disabled={amendDisabled}
          title={amendTitle}
          data-testid="workspace-edit"
        >
          Request amendment
        </CBtn>
        <span className="relative flex">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
            title="More actions"
            aria-expanded={menuOpen}
            data-testid="so-more"
            className={`grid h-[34px] w-[34px] place-items-center rounded-full text-c-body hover:bg-c-hover focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:-2px] ${menuOpen ? "bg-c-hover" : ""}`}
          >
            <MIcon name="more_vert" size={20} />
          </button>
          <PopMenu open={menuOpen} onClose={() => setMenuOpen(false)} groups={menu} label="More actions" />
        </span>
        <span className="mx-1 h-6 w-px self-center bg-c-btn-border" aria-hidden="true" />
        <TasksPill />
      </div>
    </header>
  );
}
