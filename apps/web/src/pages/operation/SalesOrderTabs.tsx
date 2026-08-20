import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { TopBarIcons } from "./components/GlobalTopBar";

/** One object identity: return path, document number, customer, navigation,
 *  actions. The Sales Order page is the reference; the Delivery Order object
 *  page reuses the SAME header with its own back destination — one
 *  implementation, never a second lookalike (ownership Law C). */
export default function SalesOrderTabs({
  identity,
  customer,
  navigation,
  onBack,
  right,
  docTitle,
  backTo = "/operation/orders",
  backLabel = "Sales Orders",
}: {
  identity: string;
  customer?: string | null;
  navigation?: ReactNode;
  onBack?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  right?: ReactNode;
  docTitle?: string;
  /** The register this object returns to. */
  backTo?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    document.title = docTitle ?? `${identity} — Carres`;
    return () => { document.title = "Carres Portal"; };
  }, [docTitle, identity]);
  return (
    <header className="shrink-0 border-b border-base-200 bg-white" data-testid="sales-order-tabs">
      <div className="flex h-11 items-center gap-3 px-6">
        <Link
          to={backTo}
          className="inline-flex h-full shrink-0 items-center gap-1.5 text-body text-base-600 hover:text-kit-blue-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
          aria-label={backLabel}
          onClick={onBack}
        >
          <ArrowLeft size={14} /> {backLabel}
        </Link>
        <span className="h-4 w-px bg-base-200" aria-hidden="true" />
        {/* ⭐ IDENTITY SURVIVES NARROW WIDTH — owner ruling 2026-08-15 (Chai).
            The whole label used to be ONE truncating span inside a `min-w-0`
            flex item, so below medium desktop it collapsed to the bare icon
            and the header stopped saying which order was open. The SO number
            is the identity and never shrinks; the CUSTOMER is context and is
            the part allowed to truncate away. Locked by MASTER §0.1: identity
            persists in View AND Edit. */}
        <span className="inline-flex min-w-0 items-center gap-1.5 text-body font-semibold text-base-900">
          <ClipboardList size={15} className="shrink-0 text-base-700" />
          <span className="shrink-0" data-testid="object-identity">{identity}</span>
          {customer && (
            <span className="min-w-0 truncate font-normal text-base-600" data-testid="object-identity-customer">
              · {customer}
            </span>
          )}
        </span>
        <div className="flex-1" />
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
        <TopBarIcons />
      </div>
      {navigation && <div className="flex h-9 items-stretch px-6" data-testid="object-navigation">{navigation}</div>}
    </header>
  );
}
