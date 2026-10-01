import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import Icon from "../../components/kit/Icon";
import Tooltip from "../../components/kit/Tooltip";
import { TopBarIcons } from "./components/GlobalTopBar";

/** One object identity: return path, document number, customer, navigation,
 *  actions. The Sales Order page is the reference; the Delivery Order object
 *  page reuses the SAME header with its own back destination — one
 *  implementation, never a second lookalike (ownership Law C). */
export default function SalesOrderTabs({
  identity,
  customer,
  status,
  navigation,
  onBack,
  right,
  docTitle,
  backTo = "/operation/orders",
  backLabel = "Sales Orders",
}: {
  identity: string;
  customer?: string | null;
  /** One derived state pill beside the identity (Card 05 — the Manual
   *  Purchase object header). Optional; absent, every existing caller is
   *  byte-identical. A fact, never a control. */
  status?: ReactNode;
  navigation?: ReactNode;
  onBack?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  right?: ReactNode;
  docTitle?: string;
  /** The register this object returns to. */
  backTo?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    document.title = docTitle ?? `${identity} · Carres`;
    return () => { document.title = "Carres Portal"; };
  }, [docTitle, identity]);
  return (
    <header className="shrink-0 border-b border-base-200 bg-white" data-testid="sales-order-tabs" data-kit="object-header">
      {/* ⭐ BELOW 768px THE HEADER IS TWO ROWS — owner ruling 2026-09-26 (Jess).
          Measured at 375px: `SO-1365` and `Print ▾` overprinted each other —
          one 44px row held the back link, the number, the actions and the
          global icons, all `shrink-0`. Row 1 is the way back and the global
          icons; row 2 is the identity and the actions. From 768px it is the
          one row it always was. */}
      <div data-slot="object-header-row" className="flex flex-wrap items-center gap-x-3 px-4 md:h-11 md:flex-nowrap md:px-6">
        <Tooltip content={`Back to ${backLabel}`}><Link
          to={backTo}
          className="order-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-kit-slate-5 bg-white text-kit-slate-12 hover:bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9 md:order-none md:h-8 md:w-8"
          aria-label={`Back to ${backLabel}`}
          onClick={onBack}
        >
          <Icon name="back" size={16} />
        </Link></Tooltip>
        <span data-slot="object-header-divider" className="hidden h-4 w-px bg-base-200 md:block" aria-hidden="true" />
        {/* ⭐ IDENTITY SURVIVES NARROW WIDTH — owner ruling 2026-08-15 (Chai).
            The SO number is the identity and never shrinks; the CUSTOMER is
            context and is the part allowed to truncate away, with its full
            name kept for a reader. Locked by MASTER §0.1: identity persists in
            View AND Edit. */}
        <span
          className="order-3 inline-flex h-11 min-w-0 flex-1 items-center gap-1.5 text-body font-semibold text-base-900 md:order-none md:h-auto md:flex-none"
          data-testid="object-header-identity"
          aria-label={[identity, customer].filter(Boolean).join(" · ")}
        >
          <ClipboardList size={15} className="shrink-0 text-base-700" />
          <span className="shrink-0" data-testid="object-identity">{identity}</span>
          {customer && (
            <span
              className="min-w-0 truncate font-normal text-base-600"
              data-testid="object-identity-customer"
              title={customer}
            >
              · {customer}
            </span>
          )}
          {status && (
            <span className="shrink-0 pl-1.5" data-testid="object-identity-status">
              {status}
            </span>
          )}
        </span>
        <div data-slot="object-header-spacer" className="hidden flex-1 md:block" />
        {right && (
          <div className="order-4 flex shrink-0 items-center gap-2 md:order-none" data-testid="object-header-actions">
            {right}
          </div>
        )}
        <div className="order-2 ml-auto md:order-none md:ml-0" data-testid="object-header-global">
          <TopBarIcons />
        </div>
        <span className="order-2 basis-full md:hidden" data-testid="object-header-break" aria-hidden="true" />
      </div>
      {navigation && <div className="flex h-9 items-stretch overflow-x-auto border-t border-kit-slate-5 bg-kit-slate-2 px-4 md:px-6" data-testid="object-navigation">{navigation}</div>}
    </header>
  );
}
