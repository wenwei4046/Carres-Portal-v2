import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";

/**
 * Phase 10 · Principal · Suppliers — `reference/proto/principal-suppliers.jsx`
 * pixel parity. 2-col grid of clickable supplier cards; click opens a 480-wide
 * right-side drawer with recent 12 POs.
 */

type SupplierRow = {
  id: string;
  name: string;
  contact: string | null;
  contactEmail: string | null;
  leadTime: string | null;
  kind: "own_logistics" | "factory_pickup" | null;
  catCovered: string[];
  portalEnabled: boolean;
  slug: string | null;
  openPos: number;
  receivedPos: number;
  totalPos: number;
};

type PoRow = {
  id: string;
  status: string;
  supStatus: string | null;
  etaDate: string | null;
  placedAt: string | null;
};

export default function PrincipalSuppliers() {
  const { data, isLoading } = useQuery<{ suppliers: SupplierRow[] }>({
    queryKey: qk.principal.suppliers(),
    queryFn: () => apiFetch("/api/principal/suppliers"),
  });
  const suppliers = data?.suppliers ?? [];
  const [open, setOpen] = useState<SupplierRow | null>(null);

  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-[22px]">
        <div className="kicker">HQ · Network</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-semibold">
          Suppliers
        </h1>
        <div className="text-[13px] text-base-600 mt-1.5">
          {suppliers.length} active · upstream of stock pipeline.
        </div>
      </div>

      {isLoading && <div className="text-[13px] text-base-600">Loading…</div>}

      {!isLoading && suppliers.length === 0 && (
        <div className="text-[13px] text-base-500">No suppliers yet.</div>
      )}

      <div className="grid grid-cols-2 gap-3.5">
        {suppliers.map((s) => (
          <button
            key={s.id}
            onClick={() => setOpen(s)}
            className="text-left p-5 bg-white border border-base-200 rounded hover:border-base-400 transition-colors cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2.5">
              <div>
                <div className="text-[16px] font-semibold">{s.name}</div>
                <div className="text-[11.5px] text-base-500 mt-[3px]">
                  {s.contactEmail ?? s.contact ?? "—"}
                </div>
              </div>
              <KindChip kind={s.kind} />
            </div>
            <div className="grid grid-cols-3 gap-2.5 mt-3.5">
              <Stat label="Open POs" v={s.openPos} />
              <Stat label="Received" v={s.receivedPos} />
              <Stat label="Lead time" v={s.leadTime ?? "—"} />
            </div>
            <div className="mt-3 text-[11px] text-base-500">
              Covers · {s.catCovered.length ? s.catCovered.join(" · ") : "—"}
            </div>
          </button>
        ))}
      </div>

      {open && <SupplierDrawer supplier={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function KindChip({ kind }: { kind: SupplierRow["kind"] }) {
  if (!kind) return null;
  const isOwn = kind === "own_logistics";
  return (
    <span
      className={`text-[9.5px] font-bold uppercase tracking-[0.06em] px-2.5 py-[2px] rounded-full ${
        isOwn ? "bg-success-soft text-success" : "bg-base-100 text-base-700"
      }`}
    >
      {isOwn ? "Own Logistics" : "Factory Pickup"}
    </span>
  );
}

function Stat({ label, v }: { label: string; v: number | string }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-base-500">
        {label}
      </div>
      <div className="text-[15px] font-semibold text-base-900 mt-0.5">{v}</div>
    </div>
  );
}

function SupplierDrawer({ supplier, onClose }: { supplier: SupplierRow; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ pos: PoRow[] }>({
    queryKey: ["principal", "suppliers", supplier.id, "pos"],
    queryFn: () => apiFetch(`/api/principal/suppliers/${supplier.id}/pos`),
  });
  const pos = data?.pos ?? [];

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative w-[480px] bg-white h-screen overflow-auto p-7">
        <div className="flex justify-between items-start mb-[18px]">
          <div>
            <div className="kicker">{supplier.slug ?? supplier.id.slice(0, 8)}</div>
            <h2 className="font-display text-[22px] mt-1 font-semibold">
              {supplier.name}
            </h2>
            <div className="text-[12px] text-base-600 mt-1">
              {supplier.contactEmail ?? supplier.contact ?? "—"}
              {supplier.leadTime ? ` · ${supplier.leadTime}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[18px] text-base-500 hover:text-base-900 cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-base-500 mb-2">
          Recent POs
        </div>
        <div className="border border-base-200 rounded">
          {isLoading && <div className="p-4 text-[12px] text-base-500">Loading…</div>}
          {!isLoading && pos.length === 0 && (
            <div className="p-4 text-[12px] text-base-500">No POs yet.</div>
          )}
          {pos.map((p, i) => (
            <div
              key={p.id}
              className={`px-3.5 py-2.5 flex justify-between text-[12px] ${i ? "border-t border-base-100" : ""}`}
            >
              <div>
                <div className="font-mono font-semibold">{p.id}</div>
                <div className="text-[11px] text-base-500 mt-0.5">
                  {p.placedAt?.slice(0, 10) ?? "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10.5px] text-base-500 uppercase font-semibold tracking-[0.05em]">
                  {(p.supStatus ?? p.status)?.replace(/_/g, " ")}
                </div>
                <div className="text-[10.5px] text-base-500 mt-0.5">
                  {p.etaDate ? `ETA ${p.etaDate}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
