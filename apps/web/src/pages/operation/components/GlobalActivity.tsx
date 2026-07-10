import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { OrderEventCategory } from "@carres/shared";
import { useOperationActivity, type GlobalActivityRow } from "@/lib/queries";
import { useActiveOrder } from "@/lib/active-order";
import { fmtDate } from "@/lib/fmt-date";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  IconChip,
  describeActivity,
  isToday,
  isYesterday,
} from "./activity-display";

/**
 * The GLOBAL activity feed — everything across all orders in one place, with
 * search + category tabs + a staff filter. Each row names its order and, on
 * click, scopes the Activity panel to that order (via the shared active-order
 * store). This is the "monitor" surface; the per-order timeline is the drill-in.
 */
export default function GlobalActivity() {
  const { data, isLoading } = useOperationActivity();
  const setActiveOrder = useActiveOrder((s) => s.set);
  const rows = useMemo(() => data ?? [], [data]);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<OrderEventCategory | "all">("all");
  const [staff, setStaff] = useState<string | "all">("all");

  // Decorate once with category + display title.
  const decorated = useMemo(
    () => rows.map((r) => ({ row: r, ...describeActivity(r) })),
    [rows],
  );

  const counts = useMemo(() => {
    const m = {} as Record<OrderEventCategory, number>;
    for (const d of decorated) m[d.category] = (m[d.category] ?? 0) + 1;
    return m;
  }, [decorated]);
  const presentCategories = CATEGORY_ORDER.filter((c) => counts[c] > 0);

  const staffNames = useMemo(
    () => [...new Set(rows.map((r) => r.actor_name).filter(Boolean) as string[])].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return decorated.filter((d) => {
      if (cat !== "all" && d.category !== cat) return false;
      if (staff !== "all" && d.row.actor_name !== staff) return false;
      if (needle) {
        const hay = [
          d.title,
          d.body ?? "",
          d.row.so ? `so-${d.row.so}` : "",
          d.row.customer_name ?? "",
          d.row.actor_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [decorated, cat, staff, q]);

  const today = filtered.filter((d) => isToday(d.row.occurred_at));
  const yesterday = filtered.filter((d) => isYesterday(d.row.occurred_at));
  const earlier = filtered.filter(
    (d) => !isToday(d.row.occurred_at) && !isYesterday(d.row.occurred_at),
  );

  return (
    <div>
      {/* Search */}
      <div className="flex items-center gap-2 border border-base-200 rounded-[8px] px-2.5 py-1.5 bg-white mb-2">
        <Search size={14} className="text-base-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search order, customer, or staff…"
          className="w-full text-[12px] bg-transparent outline-none placeholder-base-400"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap items-center gap-1 mb-1.5">
        <Chip label="All" count={decorated.length} active={cat === "all"} onClick={() => setCat("all")} />
        {presentCategories.map((c) => (
          <Chip
            key={c}
            label={CATEGORY_LABEL[c]}
            count={counts[c]}
            active={cat === c}
            danger={c === "exception"}
            onClick={() => setCat(c)}
          />
        ))}
      </div>

      {/* Staff filter */}
      {staffNames.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 mb-2">
          <span className="text-[10px] text-base-400 mr-0.5">Staff</span>
          <Chip label="Everyone" active={staff === "all"} onClick={() => setStaff("all")} subtle />
          {staffNames.map((n) => (
            <Chip key={n} label={n} active={staff === n} onClick={() => setStaff(n)} subtle />
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="text-[12px] text-base-400 py-2">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-[12px] text-base-500 py-4 text-center">Nothing matches.</div>
      ) : (
        <div className="bg-white border border-base-200 rounded-[8px] px-3 py-1">
          {today.length > 0 && <DayGroup label="Today" items={today} onOpen={setActiveOrder} />}
          {yesterday.length > 0 && (
            <DayGroup label="Yesterday" items={yesterday} onOpen={setActiveOrder} />
          )}
          {earlier.length > 0 && <DayGroup label="Earlier" items={earlier} onOpen={setActiveOrder} />}
        </div>
      )}
    </div>
  );
}

type Decorated = {
  row: GlobalActivityRow;
  category: OrderEventCategory;
  title: string;
  body: string | null;
};

function DayGroup({
  label,
  items,
  onOpen,
}: {
  label: string;
  items: Decorated[];
  onOpen: (orderId: string | null) => void;
}) {
  return (
    <>
      <div className="text-[10px] uppercase tracking-[0.05em] text-base-400 pt-2 pb-0.5">
        {label}
      </div>
      {items.map((d) => (
        <FeedRow key={`${d.row.kind}-${d.row.id}`} d={d} onOpen={onOpen} />
      ))}
    </>
  );
}

function FeedRow({ d, onOpen }: { d: Decorated; onOpen: (orderId: string | null) => void }) {
  const { row, category, title, body } = d;
  const clickable = !!row.order_id;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onOpen(row.order_id)}
      className={`w-full flex gap-2.5 py-2 text-left border-t border-dashed border-base-100 first:border-t-0 ${
        clickable ? "hover:bg-base-50" : ""
      } ${category === "exception" ? "-mx-3 px-3 bg-red-50/60" : ""}`}
    >
      <div className="pt-0.5">
        <IconChip category={category} size={26} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-base-800 leading-snug truncate">
          <span className={category === "exception" ? "font-medium text-red-700" : "font-medium"}>
            {title}
          </span>
          {body ? <span className="text-base-600"> — {body}</span> : null}
        </div>
        <div className="text-[11px] text-base-500 truncate">
          {row.so ? <span className="font-medium text-base-700">SO-{row.so}</span> : "—"}
          {row.customer_name ? ` · ${row.customer_name}` : ""}
          {row.actor_name ? ` · ${row.actor_name}` : ""}
          {" · "}
          {fmtDate(row.occurred_at, { time: true })}
        </div>
      </div>
      {clickable && <ChevronRight size={14} className="text-base-300 self-center shrink-0" />}
    </button>
  );
}

function Chip({
  label,
  count,
  active,
  danger,
  subtle,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  danger?: boolean;
  subtle?: boolean;
  onClick: () => void;
}) {
  const border = danger ? "#F0997B" : "#DDD8CE";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border transition-colors"
      style={{
        fontSize: subtle ? "11px" : "11.5px",
        padding: subtle ? "2px 9px" : "3px 11px",
        color: active ? "#FFFFFF" : danger ? "#A32D2D" : "#4B5563",
        background: active ? "#221F20" : "#FFFFFF",
        borderColor: active ? "#221F20" : border,
      }}
    >
      {label}
      {count !== undefined && (
        <span className="tabular-nums" style={{ color: active ? "rgba(255,255,255,0.7)" : "#9CA3AF" }}>
          {count}
        </span>
      )}
    </button>
  );
}
