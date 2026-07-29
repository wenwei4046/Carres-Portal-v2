import DealerStatusPill from "./DealerStatusPill";

/**
 * Single `<tr>` in the dealers table. Mirrors the proto row at
 * `reference/proto/principal-dealers.jsx` lines 74-90.
 *
 * Field shape matches the camelCase rows produced by `GET /api/principal/
 * dealers` (the route does the snake→camel adapter inline, see
 * `apps/api/src/routes/principal/dealers.ts:77-90`).
 */
export interface DealerListItem {
  id: string;
  name: string;
  contact: string | null;
  region: string;
  joinedDate: string | null;
  status: string;
  orderCount: number;
  gmv: number;
  outstanding: number;
  /** 'showroom' = one of Carres' own stores; 'dealer' = external reseller. */
  channel: string;
  /** Branches under this account. Shown on the Dealers page only — our own
   *  showrooms ARE the branch, so the column would read "1" for every row. */
  outletCount: number;
}

interface Props {
  d: DealerListItem;
  showOutlets: boolean;
  onOpen: () => void;
}

export default function DealerRow({ d, showOutlets, onOpen }: Props) {
  const hasOutstanding = Number(d.outstanding) > 0;
  return (
    <tr
      onClick={onOpen}
      className="border-t border-base-100 cursor-pointer hover:bg-base-50"
    >
      <td className="px-4 py-3">
        <div className="font-semibold">{d.name}</div>
        <div className="text-label text-base-500 mt-0.5">{d.contact ?? "—"}</div>
      </td>
      <td className="px-4 py-3 text-base-700">{d.region}</td>
      {showOutlets && (
        <td
          className={`px-4 py-3 text-right font-mono ${
            d.outletCount === 0 ? "text-primary" : "text-base-700"
          }`}
          // 0 outlets is worth flagging: the store cannot take an order until
          // one exists (the POS outlet picker would sit empty).
          title={d.outletCount === 0 ? "No outlet yet — this dealer cannot take an order" : undefined}
        >
          {d.outletCount}
        </td>
      )}
      <td className="px-4 py-3 text-base-700">{d.joinedDate ?? "—"}</td>
      <td className="px-4 py-3 text-right font-mono">{d.orderCount}</td>
      <td className="px-4 py-3 text-right font-semibold font-mono">
        RM {(Number(d.gmv) / 1000).toFixed(1)}k
      </td>
      <td
        className={`px-4 py-3 text-right font-mono ${
          hasOutstanding ? "text-primary" : "text-base-500"
        }`}
      >
        {hasOutstanding ? `RM ${Number(d.outstanding).toLocaleString()}` : "—"}
      </td>
      <td className="px-4 py-3">
        <DealerStatusPill status={d.status} />
      </td>
      <td className="px-4 py-3 text-right text-base-400">›</td>
    </tr>
  );
}
