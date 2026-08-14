import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardList } from "lucide-react";
import ModuleHeader from "./components/ModuleHeader";

/** One object identity: return path, document number, customer, navigation, actions. */
export default function SalesOrderTabs({
  identity,
  customer,
  navigation,
  onBack,
  right,
  docTitle,
}: {
  identity: string;
  customer?: string | null;
  navigation?: ReactNode;
  onBack?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  right?: ReactNode;
  docTitle?: string;
}) {
  return (
    <ModuleHeader
      testId="sales-order-tabs"
      icon={ClipboardList}
      word={`${identity}${customer ? ` · ${customer}` : ""}`}
      docTitle={docTitle ?? `${identity} — Carres`}
      right={right}
    >
      <Link
        to="/operation/orders"
        className="inline-flex h-full shrink-0 items-center gap-1.5 px-2 text-body text-base-600 hover:text-base-900"
        aria-label="Back to Sales Orders"
        onClick={onBack}
      >
        <ArrowLeft size={14} /> Back to Sales Orders
      </Link>
      {navigation}
    </ModuleHeader>
  );
}
