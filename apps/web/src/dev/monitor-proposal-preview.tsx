/**
 * MONITOR — D1 + D2 + D3 PROPOSAL · DESIGN PREVIEW ONLY.
 *
 * ⛔ NOT production. No shipped file is imported or changed.
 *
 * ── THE SHELL IS THE MEASURED ONE, NOT A CONVENIENT ONE ────────────────────
 *
 * Measured on production `38868b00`, 2026-09-11. The first draft of this
 * preview left the page header, the tab strip and the toolbar out, which made
 * the sidebar "fit" for a reason that does not exist. Every band below is
 * reproduced at its measured height, and the filter region is a REAL 421px
 * scrolling box — so the 43px it overflows is SEEN here, not asserted.
 *
 *   1440×900   portal nav 232 · rail 240 · table viewport 885 · right rail 52
 *   949×800    portal nav  60 · rail 240 · table viewport 566 · right rail 52
 *              collapsed: strip 44 → table viewport 762
 *
 *   vertical   header 50 · tab strip 40 · toolbar 53 · sheet
 *   rail       fixed 429 (both months, TOP — baseline) + scroll 421 (filters)
 *   filters    padding 12 · group title 14 · row 36 · kit Select 32 · gap 20
 *   columns    30·32·150·170·110·186·210·230·210·110·250·130 = 1818
 *
 * D1  STATE / LOGISTICS PARTNER / DELIVERY STATUS become kit dropdowns.
 *     The two months STAY AT THE TOP. Content 1152 → 464 against 421 available.
 * D2  `SO No` AND `Customer` stay pinned when the sheet scrolls sideways.
 * D3  Under 1100px the sidebar starts collapsed, with a labelled way back.
 *
 * Rows are real production records. FIXTURE rows are marked in the GUTTER,
 * outside the business row — a tinted row would read as a status.
 */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  Phone,
  Search,
  X,
} from "lucide-react";
import "@/index.css";

/* ── measured geometry ─────────────────────────────────────────────────── */
const HEADER_H = 50;
const TABS_H = 40;
const TOOLBAR_H = 53;
const RAIL_W = 240;
const RAIL_FIXED_H = 429;
const RAIL_SCROLL_H = 421;
const RIGHT_RAIL_W = 52;
const COLLAPSED_W = 44;

const COLS = [
  { key: "sel", label: "", w: 30 },
  { key: "caret", label: "", w: 32 },
  { key: "so", label: "SO No", w: 150 },
  { key: "customer", label: "Customer", w: 170 },
  { key: "state", label: "State", w: 110 },
  { key: "requested", label: "Requested Delivery Date", w: 186 },
  { key: "items", label: "Items", w: 210 },
  { key: "extras", label: "Accessories & services", w: 230 },
  { key: "arrival", label: "Expected arrival", w: 210 },
  { key: "stock", label: "Stock", w: 110 },
  { key: "actions", label: "Actions", w: 250 },
  { key: "edit", label: "Edit Delivery", w: 130 },
] as const;

const PIN_LEFT: Record<string, number> = { sel: 0, caret: 30, so: 62, customer: 212 };
const PINNED = new Set(Object.keys(PIN_LEFT));

type Arrival =
  | { kind: "none" }
  | { kind: "plain"; date: string }
  | { kind: "confirmed"; date: string }
  | { kind: "passed"; date: string }
  | { kind: "moved"; date: string; original: string };

interface Row {
  so: string; ref: string; customer: string; partner: string | null; state: string;
  requested: string; items: string[]; extras: string[]; arrival: Arrival;
  stock: [string, string | null]; action: string; deadline: string | null;
  late?: boolean; fixture?: boolean;
}

const ROWS: Row[] = [
  { so: "SO-1358", ref: "CR0854", customer: "Aina Rahman", partner: null, state: "Kuala Lumpur",
    requested: "Sat, 31 Oct", items: ["Fenrir · King × 1 — 1 short"],
    extras: ["Service · Dispose old mattress", "Service · Delivery fee", "Floor 1 · No lift"],
    arrival: { kind: "none" }, stock: ["Not ready", "1 short"],
    action: "Assign logistics", deadline: "Wed, 28 Oct" },
  { so: "SO-1340", ref: "CR0912", customer: "TestWhole", partner: "NETS", state: "Penang",
    requested: "Fri, 23 Oct", items: ["H1401F · King × 1 — 1 short"],
    extras: ["None", "Floor 1 · No lift"],
    arrival: { kind: "plain", date: "Thu, 17 Sep" }, stock: ["Not ready", "1 short"],
    action: "Call NETS — confirm delivery date", deadline: "Tue, 20 Oct" },
  { so: "SO-1328", ref: "CR0877", customer: "Jess", partner: "AL", state: "Pahang",
    requested: "Wed, 30 Sep", items: ["H1401F · King × 1 — 1 short"],
    extras: ["None", "Floor 1 · No lift"],
    arrival: { kind: "confirmed", date: "Mon, 14 Sep" }, stock: ["Not ready", "1 short"],
    action: "Call AL — confirm delivery date", deadline: "Sat, 26 Sep" },
  /* The supplier-revised case. FIXTURE — marked in the gutter, never by tinting
     the row: a coloured row reads as a STATUS, and this row has none. */
  { so: "SO-1327", ref: "CR0854", customer: "Chong Kah Wai", partner: null, state: "Selangor",
    requested: "Fri, 18 Sep", items: ["Serena · King × 2 — 1 short"],
    extras: ["Pillow soft × 2 — 2 short", "Service · Dispose old mattress", "Floor 3 · No lift"],
    arrival: { kind: "moved", date: "Tue, 22 Sep", original: "Mon, 14 Sep" },
    stock: ["Not ready", "3 short"], action: "Assign logistics", deadline: "Mon, 14 Sep",
    fixture: true },
  { so: "SO-1210", ref: "CR0801", customer: "Dato", partner: "NETS", state: "Pahang",
    requested: "Wed, 19 Aug", items: ["S1601F · King × 2 — 2 short", "CODY-K × 2 — 2 short"],
    extras: ["Service · Delivery fee", "Floor 1 · No lift"],
    arrival: { kind: "passed", date: "Thu, 13 Aug" }, stock: ["Not ready", "4 short"],
    action: "Call NETS — confirm delivery date", deadline: "Sat, 15 Aug", late: true },
];

const Absent = ({ children }: { children: string }) => (
  <span className="text-kit-slate-9" data-absence="true">{children}</span>
);

function ArrivalCell({ a }: { a: Arrival }) {
  if (a.kind === "none") {
    return <span className="block truncate text-kit-slate-9">No purchase order raised yet</span>;
  }
  const exception = a.kind === "passed";
  const Icon = a.kind === "confirmed" ? CheckCircle2
    : a.kind === "moved" ? CalendarClock
    : exception ? AlertTriangle : null;
  const tone = exception ? "text-kit-amber-11" : "text-kit-slate-11";
  return (
    <span className="block min-w-0">
      <span className="flex min-w-0 items-center gap-1">
        {Icon ? <Icon size={13} strokeWidth={2} aria-hidden className={`shrink-0 ${tone}`} /> : null}
        <span className={`truncate ${exception ? "text-kit-amber-11" : "text-kit-slate-12"}`}>{a.date}</span>
      </span>
      {a.kind === "moved" ? (
        <span className="block truncate text-label text-kit-slate-9">{a.original}</span>
      ) : null}
    </span>
  );
}

function Cell({ r, k }: { r: Row; k: string }) {
  switch (k) {
    case "sel": return <input type="checkbox" aria-label="Select row" />;
    case "caret": return <span className="text-kit-slate-11">▸</span>;
    case "so": return (
      <span className="block min-w-0">
        <span className="block truncate font-mono text-kit-blue-11">{r.so}</span>
        <span className="block truncate text-label text-kit-slate-9">{r.ref}</span>
      </span>);
    case "customer": return (
      <span className="block min-w-0">
        <span className="block truncate text-kit-slate-12">{r.customer}</span>
        <span className="block truncate text-label">{r.partner ?? <Absent>No logistics picked</Absent>}</span>
      </span>);
    case "state": return <span className="block truncate">{r.state}</span>;
    case "requested": return (
      <span className="block min-w-0">
        <span className="block truncate">{r.requested}</span>
        <span className="block truncate text-label"><Absent>No confirmed date</Absent></span>
      </span>);
    case "items": return (
      <span className="block min-w-0">{r.items.map((l) => <span key={l} className="block truncate">{l}</span>)}</span>);
    case "extras": return (
      <span className="block min-w-0">
        {r.extras.map((l) => <span key={l} className="block truncate text-label text-kit-slate-11">{l}</span>)}
      </span>);
    case "arrival": return <ArrivalCell a={r.arrival} />;
    case "stock": return (
      <span className="block min-w-0">
        <span className="block truncate">{r.stock[0]}</span>
        {r.stock[1] ? <span className="block truncate text-label text-kit-slate-9">{r.stock[1]}</span> : null}
      </span>);
    case "actions": return (
      <span className="block min-w-0">
        <span className="block truncate text-kit-slate-12">{r.action}</span>
        {r.deadline ? (
          <span className={`flex min-w-0 items-center gap-1 text-label ${r.late ? "font-medium text-kit-red-11" : "text-kit-slate-11"}`}>
            <Phone size={12} strokeWidth={2} aria-hidden className="shrink-0" />
            <span className="truncate">{r.deadline}</span>
          </span>) : null}
      </span>);
    case "edit": return (
      <button type="button" className="truncate rounded-control border border-kit-slate-6 bg-white px-2 py-0.5 text-meta font-medium text-kit-slate-12">
        Edit Delivery
      </button>);
    default: return null;
  }
}

const HEAD_H = 30;
const ROW_H = 54;

/** The sheet, clipped to the MEASURED table viewport. */
function Sheet({ width, height, scrollLeft }: { width: number; height: number; scrollLeft: number }) {
  return (
    <div className="flex min-h-0" style={{ height }}>
      {/* ⭐ THE FIXTURE GUTTER — outside the business row, so no row is tinted. */}
      <div className="w-[18px] shrink-0 border-r border-kit-slate-5 bg-kit-canvas">
        <div style={{ height: HEAD_H }} />
        {ROWS.map((r) => (
          <div key={r.so} className="flex items-center justify-center" style={{ height: ROW_H }}>
            {r.fixture ? (
              <span title="FIXTURE data — production holds no such record"
                className="text-[8px] font-medium tracking-tight text-kit-amber-11"
                style={{ writingMode: "vertical-rl" }}>FIXTURE</span>
            ) : null}
          </div>))}
      </div>
      <div className="overflow-auto" style={{ width, height }} ref={(el) => { if (el) el.scrollLeft = scrollLeft; }}>
        <table className="border-separate" style={{ width: 1818, borderSpacing: 0 }}>
          <thead>
            <tr>
              {COLS.map((c) => {
                const isPin = PINNED.has(c.key);
                return (
                  <th key={c.key}
                    style={{ width: c.w, minWidth: c.w, height: HEAD_H, ...(isPin ? { position: "sticky", left: PIN_LEFT[c.key], zIndex: 5 } : {}) }}
                    className={`border-b border-kit-slate-6 bg-kit-slate-3 px-2 text-left text-label font-medium text-kit-slate-11 ${isPin && c.key === "customer" ? "border-r border-kit-slate-6" : ""}`}>
                    {c.label}
                  </th>);
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.so}>
                {COLS.map((c) => {
                  const isPin = PINNED.has(c.key);
                  return (
                    <td key={c.key}
                      style={{ width: c.w, minWidth: c.w, height: ROW_H, ...(isPin ? { position: "sticky", left: PIN_LEFT[c.key], zIndex: 2 } : {}) }}
                      className={`border-b border-kit-slate-5 bg-white px-2 py-1.5 align-top text-meta text-kit-slate-12 ${isPin && c.key === "customer" ? "border-r border-kit-slate-6" : ""}`}>
                      <Cell r={r} k={c.key} />
                    </td>);
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── a REAL month grid, built from Date ────────────────────────────────── */
function MiniMonth({ year, month }: { year: number; month: number }) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const title = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase();
  return (
    <div className="px-3">
      <div className="flex items-center justify-between pb-1">
        <ChevronLeft size={13} className="text-kit-slate-11" />
        <span className="text-label font-medium tracking-wide text-kit-slate-11">{title}</span>
        <ChevronRight size={13} className="text-kit-slate-11" />
      </div>
      <table className="w-full table-fixed">
        <thead><tr>{["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((d) => (
          <th key={d} className="pb-0.5 text-center text-label font-normal text-kit-slate-9">{d}</th>))}</tr></thead>
        <tbody>
          {weeks.map((w, i) => (
            <tr key={i}>{w.map((n, j) => (
              <td key={j} className="py-[3px] text-center text-label text-kit-slate-11">{n ?? ""}</td>))}</tr>))}
        </tbody>
      </table>
    </div>
  );
}

const WORK = [
  ["All delivery work", 89, true], ["No logistics picked", 6, false], ["Call customer", 88, false],
  ["Overdue delivery", 1, false], ["Failed Delivery", 0, false], ["Upload delivery proof", 0, false],
] as const;

function Dropdown({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="px-1 pb-1 text-label font-medium tracking-wide text-kit-slate-9" style={{ height: 14 }}>{title}</div>
      <div className="px-1" style={{ paddingTop: 8 }}>
        <button type="button" className="flex w-full items-center justify-between rounded-control border border-kit-slate-6 bg-white px-2 text-meta text-kit-slate-12" style={{ height: 32 }}>
          <span className="truncate">{value}</span><span className="shrink-0 text-kit-slate-9">▾</span>
        </button>
      </div>
    </div>
  );
}

/** BASELINE: both months at the TOP in a fixed 429px band; the filters scroll
 *  below them in a REAL 421px box, so an overflow is seen and not claimed. */
function Sidebar({ onHide }: { onHide?: () => void }) {
  return (
    <aside className="flex shrink-0 flex-col border-r border-kit-slate-5 bg-white" style={{ width: RAIL_W }}>
      <div className="relative shrink-0 overflow-hidden border-b border-kit-slate-5" style={{ height: RAIL_FIXED_H }}>
        <div style={{ height: 12 }} />
        <MiniMonth year={2026} month={8} />
        <div style={{ height: 16 }} />
        <MiniMonth year={2026} month={9} />
        {onHide ? (
          <button type="button" onClick={onHide} title="Hide filters" aria-label="Hide filters"
            className="absolute right-2 top-2 rounded-control border border-kit-slate-6 bg-white p-1 text-kit-slate-11">
            <X size={13} aria-hidden />
          </button>) : null}
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto p-3" style={{ height: RAIL_SCROLL_H }}>
        <div>
          <div className="px-1 pb-1 text-label font-medium tracking-wide text-kit-slate-9" style={{ height: 14 }}>WORK TO DO</div>
          {WORK.map(([l, n, active]) => (
            <div key={l} className={`flex items-center justify-between rounded-control px-2 text-meta ${active ? "bg-kit-blue-3 font-medium text-kit-slate-12" : "text-kit-slate-11"}`} style={{ height: 37.67 }}>
              <span className="truncate">{l}</span><span className="tabular-nums">{n}</span>
            </div>))}
        </div>
        <Dropdown title="STATE" value="All states (89)" />
        <Dropdown title="LOGISTICS PARTNER" value="All partners (89)" />
        <Dropdown title="DELIVERY STATUS" value="All (89)" />
      </div>
    </aside>
  );
}

function PortalNav({ w }: { w: number }) {
  const expanded = w > 100;
  return (
    <div className="shrink-0 overflow-hidden border-r border-kit-slate-5 bg-kit-canvas" style={{ width: w }}>
      <div className="flex items-center gap-2 px-3" style={{ height: HEADER_H }}>
        <div className="h-5 w-5 shrink-0 rounded bg-kit-slate-6" />
        {expanded ? <span className="text-meta font-medium text-kit-slate-11">CARRES</span> : null}
      </div>
      {["Dashboard", "Work", "Staff & Duties", "Sales", "Purchasing", "Delivery", "Warehouse", "Payments", "Suppliers"].map((l) => (
        <div key={l} className={`flex items-center gap-2 px-3 ${l === "Delivery" ? "bg-kit-blue-3" : ""}`} style={{ height: 30 }}>
          <div className="h-3.5 w-3.5 shrink-0 rounded bg-kit-slate-5" />
          {expanded ? <span className="truncate text-label text-kit-slate-11">{l}</span> : null}
        </div>))}
    </div>
  );
}

function Header() {
  return (
    <div className="flex shrink-0 items-center border-b border-kit-slate-5 bg-kit-canvas px-4" style={{ height: HEADER_H }}>
      <span className="text-display font-medium text-kit-slate-12">Monitor</span>
      <span className="ml-auto flex items-center gap-3 text-label text-kit-slate-9">
        <span className="flex items-center gap-1"><Search size={12} aria-hidden /> Jump to…</span>
        <span>🔔 72</span><span>?</span><span>⚙</span>
      </span>
    </div>
  );
}

function Bands({ narrowing }: { narrowing?: string }) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-4 border-b border-kit-slate-5 bg-white px-3" style={{ height: TABS_H }}>
        <span className="text-meta font-medium text-kit-slate-12">Work to do <span className="tabular-nums">89</span></span>
        <span className="text-meta text-kit-slate-9">Confirmed deliveries <span className="tabular-nums">1</span></span>
      </div>
      <div className="flex shrink-0 items-center gap-3 border-b border-kit-slate-5 bg-white px-3" style={{ height: TOOLBAR_H }}>
        {narrowing ? (
          <span className="text-meta"><span className="font-medium text-kit-slate-12">{narrowing}</span>
            <span className="text-kit-slate-9"> · 89 deliveries</span></span>) : null}
        <span className="ml-auto flex items-center gap-1 rounded-control border border-kit-slate-6 bg-white px-2 py-1 text-meta text-kit-slate-9">
          <Search size={12} aria-hidden /> Search deliveries…
        </span>
      </div>
    </>
  );
}

function Frame({ title, note, width, height, children }: { title: string; note: string; width: number; height: number; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-strong font-medium text-kit-slate-12">{title}</h2>
      <p className="max-w-[1000px] pb-2 text-meta text-kit-slate-11">{note}</p>
      <div className="overflow-hidden rounded-card border-2 border-kit-slate-6" style={{ width, height }}>{children}</div>
      <p className="pt-1 text-label text-kit-slate-9">frame = {width} × {height} px</p>
    </section>
  );
}

function Shell({ navW, railOpen, tableW, scrollLeft, narrowing, onToggle, frameH }: {
  navW: number; railOpen: boolean; tableW: number; scrollLeft: number;
  narrowing?: string; onToggle?: (v: boolean) => void; frameH: number;
}) {
  return (
    <div className="flex h-full bg-white">
      <PortalNav w={navW} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <div className="flex min-h-0 flex-1">
          {railOpen ? (
            <Sidebar onHide={onToggle ? () => onToggle(false) : undefined} />
          ) : (
            <div className="flex shrink-0 flex-col items-center border-r border-kit-slate-5 bg-white pt-2" style={{ width: COLLAPSED_W }}>
              <button type="button" onClick={() => onToggle?.(true)} title="Show filters" aria-label="Show filters"
                className="flex h-8 w-8 items-center justify-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11">
                <PanelLeft size={15} aria-hidden />
              </button>
              <span className="mt-2 text-[9px] leading-none text-kit-slate-9" style={{ writingMode: "vertical-rl" }}>Show filters</span>
            </div>)}
          <div className="flex min-w-0 flex-1 flex-col">
            <Bands narrowing={narrowing} />
            <Sheet width={tableW} height={frameH - HEADER_H - TABS_H - TOOLBAR_H} scrollLeft={scrollLeft} />
          </div>
        </div>
      </div>
      <div className="shrink-0 border-l border-kit-slate-5 bg-kit-canvas" style={{ width: RIGHT_RAIL_W }} />
    </div>
  );
}

function NarrowShell({ initialOpen, scrollLeft }: { initialOpen: boolean; scrollLeft: number }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <Shell navW={60} railOpen={open} tableW={open ? 566 : 762} scrollLeft={scrollLeft}
      narrowing={open ? undefined : "All delivery work"} onToggle={setOpen} frameH={800} />
  );
}

function App() {
  return (
    <div className="min-h-screen bg-kit-canvas p-6">
      <header className="pb-5">
        <h1 className="text-display font-medium text-kit-slate-12">Monitor — D1 + D2 + D3, drawn together</h1>
        <p className="max-w-[1000px] pt-1 text-body text-kit-slate-11">
          Design preview only — no shipped file is changed. Every band is at its measured height
          from production <span className="font-mono">38868b00</span>: header 50 · tab strip 40 ·
          toolbar 53 · rail 240 (months 429 fixed + filters 421 scrolling) · right rail 52.
          Rows are real production records; the FIXTURE row is marked in the gutter, not tinted.
        </p>
      </header>

      <Frame
        title="A · 1440 × 900 — sidebar open, both months at the top (baseline unchanged)"
        note="Width: 232 portal nav + 240 rail + 885 table viewport + 52 right rail + 31 padding/scrollbar = 1440. The filter box is REAL and its numbers are the BUILT page’s: 506px of content in 421px, so DELIVERY STATUS is cut and it scrolls 85px. My first drawing said 35px because it under-counted the kit group padding — WORK TO DO is 248px and each picker group 58px, not 230 and 50. Production before this change: 1152px in 421px → 731px."
        width={1440} height={900}
      >
        <Shell navW={232} railOpen tableW={885} scrollLeft={0} frameH={900} />
      </Frame>

      <Frame
        title="B · 949 × 800 — sidebar COLLAPSED, first view"
        note="Width: 60 portal nav + 44 collapsed strip + 762 table viewport + 52 right rail + 31 = 949. `Show filters` is a labelled button, and the active narrowing sits on the toolbar so a short list can never read as the whole register."
        width={949} height={800}
      >
        <NarrowShell initialOpen={false} scrollLeft={0} />
      </Frame>

      <Frame
        title="C · 949 × 800 — collapsed, scrolled right to Actions"
        note="D2 earning its place: SO No AND Customer are still on screen while Actions is read. Without the second pin this view says `Call NETS — confirm delivery date` with no name attached to it."
        width={949} height={800}
      >
        <NarrowShell initialOpen={false} scrollLeft={1020} />
      </Frame>

      <Frame
        title="D · 949 × 800 — sidebar reopened, both months reachable"
        note="Width: 60 + 240 rail + 566 table viewport + 52 + 31 = 949. Both months sit in the fixed 429px band at the top; the filters scroll below them. ✕ collapses it again."
        width={949} height={800}
      >
        <NarrowShell initialOpen scrollLeft={0} />
      </Frame>

      <section className="mb-8">
        <h2 className="text-strong font-medium text-kit-slate-12">
          Correction 1 · the day is known, the time is not — FIXTURE
        </h2>
        <p className="max-w-[1000px] pb-2 text-meta text-kit-slate-11">
          Production holds one such arrangement (Fri 4 Sep, NETS) but it sits outside the 89 open
          rows, so no card exists to photograph. The known day is KEPT as the card's first line — it
          is a real fact, and losing it would be a second error. The missing half is named, and the
          act is about the TIME. Nothing asks for the date again, nothing claims the appointment is
          finished, and no new deadline is introduced.
        </p>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="pb-1 text-label text-kit-slate-9">✗ what the ladder gives today</p>
            <div className="w-[236px] rounded-card border border-kit-red-9 bg-white p-2">
              <p className="text-meta font-medium text-kit-slate-12">Fri, 4 Sep</p>
              <p className="text-label text-kit-slate-9">No delivery order yet</p>
              <p className="pt-1 text-meta text-kit-slate-12">Chan Mi Shell</p>
              <p className="text-label text-kit-slate-11">Klang, Selangor</p>
              <p className="text-label text-kit-slate-11">Serena · King ×1</p>
              <p className="text-label text-kit-slate-11">NETS</p>
              <span className="mt-1 inline-block rounded-full bg-kit-blue-3 px-2 py-0.5 text-label text-kit-slate-12">Delivery confirmed</span>
              <p className="pt-1 text-label text-kit-red-11">the time is missing and nothing says so</p>
            </div>
          </div>
          <div>
            <p className="pb-1 text-label text-kit-slate-9">✓ proposed</p>
            <div className="w-[236px] rounded-card border border-kit-slate-6 bg-white p-2">
              <p className="text-meta font-medium text-kit-slate-12">Fri, 4 Sep</p>
              <p className="text-meta"><Absent>No time agreed</Absent></p>
              <p className="text-label text-kit-slate-9">No delivery order yet</p>
              <p className="pt-1 text-meta text-kit-slate-12">Chan Mi Shell</p>
              <p className="text-label text-kit-slate-11">Klang, Selangor</p>
              <p className="text-label text-kit-slate-11">Serena · King ×1</p>
              <p className="text-label text-kit-slate-11">NETS</p>
              <p className="pt-1 text-label text-kit-slate-12">Call NETS — confirm delivery time</p>
            </div>
          </div>
          <div className="max-w-[340px]">
            <p className="pb-1 text-label text-kit-slate-9">the word this needs</p>
            <div className="rounded-card border border-kit-slate-6 bg-white p-3">
              <p className="text-meta text-kit-slate-11">
                <span className="font-mono text-kit-slate-12">Call {"{partner}"} — confirm delivery time</span>{" "}
                is not in the dictionary yet. It is one word from the shipped{" "}
                <span className="font-mono">confirm delivery date</span>, and it is the accurate one:
                the day is settled, the window is not.
              </p>
              <p className="pt-2 text-meta text-kit-slate-11">
                Reusing <span className="font-mono">Waiting for customer date</span> — my previous
                draft — was wrong. We have the customer's date.
              </p>
            </div>
          </div>
        </div>
        <p className="max-w-[1000px] pt-2 text-meta text-kit-slate-11">
          In <span className="font-medium">Work to do</span> the same delivery reads
          <span className="font-mono"> Fri, 4 Sep · No time agreed</span> in
          <span className="font-mono"> Requested Delivery Date</span>, and carries the same act in
          <span className="font-mono"> Actions</span>.
        </p>
      </section>

      <section>
        <h2 className="text-strong font-medium text-kit-slate-12">
          Correction 2 · a supplier who moved the date — FIXTURE row SO-1327 above
        </h2>
        <p className="max-w-[1000px] pb-2 text-meta text-kit-slate-11">
          The shipped treatment, unchanged: the NEW date leads, the ORIGINAL stays beneath it, and
          the icon is CalendarClock in slate — a revision is not an exception, so it never spends
          amber. Amber belongs to the row below it. The row is no longer tinted; FIXTURE is marked
          in the gutter, outside the business row.
        </p>
        <div className="flex items-start gap-8 rounded-card border border-kit-slate-6 bg-white p-3">
          <div style={{ width: 210 }}>
            <p className="pb-1 text-label text-kit-slate-9">Expected arrival · revised</p>
            <ArrivalCell a={{ kind: "moved", date: "Tue, 22 Sep", original: "Mon, 14 Sep" }} />
            <p className="pt-1 text-label text-kit-slate-9">tooltip:<br />
              <span className="text-kit-slate-11">Expected arrival Tue, 22 Sep · Delayed · PO Delivery Date Mon, 14 Sep</span></p>
          </div>
          <div style={{ width: 210 }}>
            <p className="pb-1 text-label text-kit-slate-9">Expected arrival · date passed</p>
            <ArrivalCell a={{ kind: "passed", date: "Thu, 13 Aug" }} />
            <p className="pt-1 text-label text-kit-slate-9">real row SO-1210 — amber</p>
          </div>
          <div style={{ width: 210 }}>
            <p className="pb-1 text-label text-kit-slate-9">Expected arrival · confirmed</p>
            <ArrivalCell a={{ kind: "confirmed", date: "Mon, 14 Sep" }} />
            <p className="pt-1 text-label text-kit-slate-9">real row SO-1328</p>
          </div>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
