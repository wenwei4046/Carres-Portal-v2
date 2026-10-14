/**
 * `/ui` — THE Carres UI kit, live (UI MASTER, owner ruling 14 Oct 2026: one kit,
 * in code; the look is Sales Order Outright v12, "this is the last").
 *
 * Every part below is the real component the pages import, rendered with TEST
 * data. Design checks this page against v12 once; after that every page is built
 * from these parts only. The earlier kit that stood here (the July decisions, the
 * slate tokens and their components) is replaced, not kept beside it: one kit.
 *
 * A part a page still draws for itself is not on this page; it is listed at the
 * end as not in the kit yet, and joins the kit when that page's turn comes.
 */
import { useEffect, useState, type ReactNode } from "react";
import MIcon from "@/components/carres/MIcon";
import CPill, { type CPillTone } from "@/components/carres/CPill";
import CPopover, { CMenuGroup, CMenuItem } from "@/components/carres/CPopover";
import CTable, { CTableCell, CTableFooter, CTableItems, type CCell, type CTableColumn } from "@/components/carres/CTable";
import CSidePanel from "@/components/carres/CSidePanel";
import { CChip, CIconButton, CShowPanelButton, CViewButton } from "@/components/carres/CToolbar";
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON, SEGMENTED_TRACK } from "@/components/kit/Tabs";
import { TasksPill, useShellTasks } from "@/pages/operation/components/ShellTasks";

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-strong text-c-ink">{title}</h2>
        {note && <p className="text-[12px] text-c-secondary">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/* ── the Carres Table, with the Sales Order view's columns and TEST rows ── */
const COLUMNS: CTableColumn[] = [
  { key: "proceed", label: "Proceed Date", width: "120px" },
  { key: "order", label: "SO No", width: "minmax(150px,1fr)" },
  { key: "items", label: "Items", width: "120px" },
  { key: "channel", label: "Sales Location", width: "minmax(120px,1fr)" },
  { key: "dloc", label: "Delivery Location", width: "minmax(170px,1fr)" },
  { key: "reqDate", label: "Customer’s original requested delivery", head: ["Customer’s original", "requested delivery"], width: "140px" },
];
type Row = { id: string; cells: Record<string, CCell> };
const ROWS: Row[] = [
  {
    id: "t1",
    cells: {
      proceed: { t: "11 Oct 26", sub: "Sun", subTone: "muted", fw: 500 },
      order: { t: "SO-TEST-01", sub: "TEST · Customer A", fw: 600, fg: "ink" },
      items: { t: "3 pcs", sub: "MS, Pillow", subTitle: "Mattress, Pillow" },
      channel: { t: "TEST Showroom A", sub: "TEST · Staff A" },
      dloc: { t: "Setapak", sub: "Kuala Lumpur" },
      reqDate: { t: "19 Nov 26", sub: "Thu", subTone: "muted", fw: 500 },
    },
  },
  {
    id: "t2",
    cells: {
      proceed: { t: "28 Aug 26", sub: "Fri", subTone: "muted", fw: 500 },
      order: { t: "SO-TEST-02", sub: "TEST · Customer B", fw: 600, fg: "ink" },
      items: { t: "2 pcs + 1 set", sub: "MS, SOF", subTitle: "Mattress, Sofa" },
      channel: { t: "TEST Showroom B", sub: "TEST · Staff B" },
      dloc: { t: "Kuala Lumpur", sub: "Kuala Lumpur" },
      reqDate: { t: "Not recorded", fg: "muted" },
    },
  },
  {
    id: "t3",
    cells: {
      proceed: { t: "2 Oct 26", sub: "Fri", subTone: "muted", fw: 500 },
      order: { t: "SO-TEST-03", sub: "TEST · a customer name long enough to need its own line", fw: 600, fg: "ink" },
      items: { t: "2 pcs" },
      channel: { t: "Could not read", fg: "warn", title: "Could not read Sales for this order. This does not mean nothing is recorded." },
      dloc: { t: "Johor Bahru", sub: "Johor" },
      reqDate: { t: "6 Oct 26", sub: "Tue · Delivered", subTone: "ok", fw: 500 },
    },
  },
];
const LONG_QTY = "· Qty: Mattress 23 · Sofa 22 · Bed frame 14 · Pillow 10 · Mattress protector 4 · Others 1";

function TableExample({ narrow }: { narrow: boolean }) {
  const [picked, setPicked] = useState<Set<string>>(new Set(["t2"]));
  const [opened, setOpened] = useState<Set<string>>(new Set(narrow ? [] : ["t1"]));
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const toggle = (r: Row) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(r.id)) n.delete(r.id);
      else n.add(r.id);
      return n;
    });
  return (
    <div className="flex min-w-0" style={{ width: narrow ? 560 : "100%", height: 300 }}>
      <CTable
        label={narrow ? "TEST list, narrow" : "TEST list"}
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        identifier={1}
        selection={{
          isSelected: (r) => picked.has(r.id),
          toggle,
          allSelected: ROWS.every((r) => picked.has(r.id)),
          toggleAll: () => setPicked((s) => (ROWS.every((r) => s.has(r.id)) ? new Set() : new Set(ROWS.map((r) => r.id)))),
          rowLabel: (r) => `Select ${r.cells.order!.t}`,
        }}
        expand={{
          isOpen: (r) => opened.has(r.id),
          toggle: (r) =>
            setOpened((s) => {
              const n = new Set(s);
              if (n.has(r.id)) n.delete(r.id);
              else n.add(r.id);
              return n;
            }),
          label: (r) => (opened.has(r.id) ? "Hide items" : "Show items"),
          render: (r, grid) => (
            <CTableItems
              label={r.cells.order!.t}
              grid={grid}
              items={[
                { key: "a", name: "TEST · Mattress model A", detail: "Queen · TEST-MS-A", qty: "1 pc" },
                { key: "b", name: "TEST · Pillow model B", detail: "Standard · TEST-PL-B", qty: "2 pcs" },
              ]}
              empty="No items on this order"
            />
          ),
        }}
        renderCell={(r, c) => <CTableCell cell={r.cells[c.key]!} />}
        footer={<CTableFooter count="3 orders" qty={LONG_QTY} pageSize={size} onPageSize={setSize} page={page} pages={2} onPage={setPage} />}
      />
    </div>
  );
}

/* ── cells and pills: every state a cell can be in ── */
const CELLS: Array<[string, CCell]> = [
  ["Identifier", { t: "SO-TEST-01", sub: "TEST · Customer A", fw: 600, fg: "ink" }],
  ["Date", { t: "11 Oct 26", sub: "Sun", subTone: "muted", fw: 500 }],
  ["Read, nothing there", { t: "Not recorded", fg: "muted" }],
  ["Read failed", { t: "Could not read", fg: "warn", title: "Could not read Payments for this order. This does not mean there is no receipt." }],
  ["No access", { t: "No access", fg: "muted", title: "You may not see this record." }],
  ["Done", { t: "6 Oct 26", sub: "Tue · Delivered", subTone: "ok", fw: 500 }],
  ["Money", { t: "RM 14,170", align: "end" }],
  ["Pill", { t: "Owes", pill: true, tone: "warn" }],
];
const TONES: CPillTone[] = ["ok", "warn", "info", "blocked", "select"];

export default function UiShowcase() {
  const [tab, setTab] = useState("open");
  const [menu, setMenu] = useState(false);
  const [summary, setSummary] = useState(true);
  const [chips, setChips] = useState(["Payment: Owes", "Problems: Open case"]);
  /* The Tasks button shows while the Tasks panel is closed; this page has no panel. */
  useEffect(() => useShellTasks.setState({ open: false }), []);

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-10 bg-c-ground px-6 py-8 text-c-ink" data-testid="ui-kit">
      <header className="flex flex-col gap-1">
        <h1 className="text-page">Carres UI kit</h1>
        <p className="text-[13px] text-c-secondary">
          The one kit (UI MASTER, 14 Oct 2026). The look is Sales Order Outright v12. Every part is the component the pages use; all data is TEST.
        </p>
      </header>

      <Section id="table" title="Carres Table" note="Sticky 40 header · 54 rows · ▸ and tick 24 · gap 10 · ▸, tick and the identifier stay while the list scrolls in its own box · ▸ opens the items on the row's own columns · the footer never widens the list.">
        <TableExample narrow={false} />
        <TableExample narrow />
      </Section>

      <Section id="cells" title="Table cells" note="Main words, then the grey second line. Nothing is cut: a long value wraps and the row grows. Three states are never merged: read and empty, read failed, no access.">
        <div className="grid grid-cols-4 gap-3">
          {CELLS.map(([name, cell]) => (
            <div key={name} className="flex flex-col gap-1.5 rounded-lg bg-c-card p-3 ring-1 ring-inset ring-c-card-border">
              <span className="text-[12px] text-c-secondary">{name}</span>
              <span className={`flex min-w-0 flex-col leading-[1.3] text-[13px] ${cell.align === "end" ? "items-end" : "items-start"}`}>
                <CTableCell cell={cell} />
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="pills" title="Pills" note="12/500, the full word, never cut.">
        <div className="flex flex-wrap items-center gap-2">
          {TONES.map((t) => (
            <CPill key={t} tone={t}>{t === "ok" ? "Paid" : t === "warn" ? "Owes" : t === "info" ? "Open" : t === "blocked" ? "Hold delivery" : "Selected"}</CPill>
          ))}
        </div>
      </Section>

      <Section id="toolbar" title="List toolbar" note="One 36px line: show a hidden panel · the views · filter chips · view and ⋮ · Tasks.">
        <div className="flex h-9 min-w-0 flex-nowrap items-center gap-2 rounded-lg bg-c-ground">
          {!summary && <CShowPanelButton label="Summary" onShow={() => setSummary(true)} />}
          <div role="tablist" aria-label="Views" className={SEGMENTED_TRACK}>
            {["open", "delivered", "all"].map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`${SEGMENT} ${tab === t ? SEGMENT_ON : SEGMENT_OFF}`}>
                {t === "open" ? "Open" : t === "delivered" ? "Delivered" : "All"}
              </button>
            ))}
          </div>
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            {chips.map((c) => (
              <CChip key={c} onClear={() => setChips((x) => x.filter((y) => y !== c))}>{c}</CChip>
            ))}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <CViewButton icon="receipt_long" name="Sales Order" showName />
            <CPopover label="More actions" role="menu" width={250} open={menu} onOpenChange={setMenu} trigger={<CIconButton icon="more_vert" label="More actions" pressed={menu} />}>
              <CMenuGroup first>EXPORT · orders shown now</CMenuGroup>
              <CMenuItem icon="table_view" note=".xlsx" onSelect={() => setMenu(false)}>Download Excel</CMenuItem>
              <CMenuItem icon="picture_as_pdf" onSelect={() => setMenu(false)}>Download PDF</CMenuItem>
              <CMenuGroup>VIEW</CMenuGroup>
              <CMenuItem icon="bookmark_add" onSelect={() => setMenu(false)}>Save as my view…</CMenuItem>
            </CPopover>
          </span>
          <TasksPill />
        </div>
      </Section>

      <Section id="side-panel" title="Side panel" note="The Summary frame: the 36px title row sits level with the toolbar; the body starts level with the table (36 + 10).">
        <div className="flex gap-3" style={{ height: 360 }}>
          {summary ? (
            <CSidePanel label="Summary" title="Summary" onHide={() => setSummary(false)}>
              {[
                ["Proceeded orders", "31"],
                ["Proceeded value", "RM 2,629"],
                ["Delivered", "12 of 31"],
                ["Problems open", "Could not read"],
              ].map(([k, v]) => (
                <div key={k} className="flex h-8 items-center justify-between text-[13px]">
                  <span className="text-c-secondary">{k}</span>
                  <span className="font-semibold tabular-nums text-c-ink">{v}</span>
                </div>
              ))}
            </CSidePanel>
          ) : (
            <CShowPanelButton label="Summary" onShow={() => setSummary(true)} />
          )}
        </div>
      </Section>

      <Section id="icons" title="Icons" note="Material Symbols Rounded.">
        <div className="flex flex-wrap items-center gap-4 text-c-body">
          {["left_panel_open", "right_panel_open", "view_column", "more_vert", "chevron_left", "chevron_right", "arrow_drop_down", "filter_alt", "check_box", "download", "print"].map((n) => (
            <span key={n} className="flex items-center gap-1.5 text-[12px] text-c-secondary">
              <MIcon name={n} size={18} />
              {n}
            </span>
          ))}
        </div>
      </Section>

      <Section id="not-yet" title="Not in the kit yet" note="Pages still draw these themselves. Each joins the kit, once, when its page's turn comes.">
        <ul className="list-disc pl-5 text-[13px] text-c-body">
          <li>Shell: side menu and top bar (they are the live app shell; check them on any page)</li>
          <li>Buttons: main, normal and quiet; inputs; dialogs</li>
          <li>The Tasks panel and its task card (round 3, approved and live)</li>
          <li>Order and purchase order pages, documents, Settings</li>
        </ul>
      </Section>
    </main>
  );
}
