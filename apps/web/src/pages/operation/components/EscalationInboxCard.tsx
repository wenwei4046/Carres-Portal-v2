import { useEscalations } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";

interface Props {
  onViewOrder: (orderId: string) => void;
}

export default function EscalationInboxCard({ onViewOrder }: Props) {
  const { data, isLoading } = useEscalations(8);
  const items = data ?? [];

  return (
    <div className="bg-white border border-base-200 rounded-[4px] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px]">🚨</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-600">
          Escalations
        </span>
        {items.length > 0 && (
          <span className="ml-auto text-[11px] font-mono font-semibold text-red-600">
            {items.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-[12px] text-base-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-[12px] text-base-500 py-1">No escalations ✓</div>
      ) : (
        <ul className="space-y-0">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={`py-2 ${i ? "border-t border-dashed border-base-100" : ""}`}
            >
              <button
                type="button"
                className="w-full text-left group"
                onClick={() => item.orders && onViewOrder(item.orders.id)}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold text-base-700 group-hover:text-primary transition-colors">
                    #{item.orders?.so ?? "—"} {item.orders?.customer_name ?? ""}
                  </span>
                  <span className="font-mono text-[9px] text-base-400 whitespace-nowrap">
                    {fmtDate(item.created_at)}
                  </span>
                </div>
                <p className="text-[11px] text-base-600 mt-0.5 line-clamp-2">
                  {item.content}
                </p>
                <span className="text-[10px] text-base-400">
                  by {item.app_users?.name ?? "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
