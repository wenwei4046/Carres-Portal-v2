/**
 * `/ui` — THE Carres UI kit, live (UI MASTER, owner ruling 14 Oct 2026: one kit,
 * in code; the look is Sales Order Outright v12, "this is the last").
 *
 * Every part below is the real component the pages import, rendered with TEST
 * data. Design checks this page against v12 once; after that every page is built
 * from these parts only. The earlier kit that stood here (the July decisions, the
 * slate tokens and their components) is replaced, not kept beside it: one kit.
 *
 * This catalogue shows the current shared design once per purpose. Retired demos,
 * historical import counts and migration worklists do not belong beside the kit.
 * Remaining consumer migration is tracked in the existing delivery handoff.
 */
import { useEffect, useState, type ReactNode } from "react";
import kitSource from "../../../../../docs/ui/MASTER.md?raw";
import MIcon from "@/components/carres/MIcon";
import CPill, { type CPillTone } from "@/components/carres/CPill";
import CPopover, { CMenu, CMenuGroup, CMenuItem } from "@/components/carres/CPopover";
import { CListCell, trackFloor, type CCell, type CListColumn } from "@/components/carres/CCell";
import { CListFooter, type CListTotals } from "@/components/carres/CListFooter";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ItemRows from "@/components/register/ItemRows";
import COrderLines, { type COrderLine } from "@/components/carres/COrderLines";
import CSidePanel from "@/components/carres/CSidePanel";
import { CChip, CIconButton, CShowPanelButton, CViewButton } from "@/components/carres/CToolbar";
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON, SEGMENTED_TRACK } from "@/components/kit/Tabs";
import { TasksPill, useShellTasks } from "@/pages/operation/components/ShellTasks";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import Drawer from "@/components/kit/Drawer";
import EmptyState from "@/components/kit/EmptyState";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Modal from "@/components/kit/Modal";
import PdfPreview from "@/components/kit/PdfPreview";
import SavedEvidenceViewer from "@/components/kit/SavedEvidenceViewer";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import StepList, { Step } from "@/components/kit/StepList";
import Tabs from "@/components/kit/Tabs";
import TaskView from "@/components/kit/TaskView";
import Textarea from "@/components/kit/Textarea";
import Tooltip from "@/components/kit/Tooltip";
import { TaskWideSurface } from "@/pages/operation/tasks/TaskFrame";

/** Display canonical specification tables, rather than maintaining another set of values. */
function specificationRows(source: string, start: string, end: string) {
  const section = source.slice(source.indexOf(start)).split(end)[0] ?? "";
  let group = "";
  return section.split("\n").flatMap((line) => {
    if (line.startsWith("### ")) group = line.slice(4);
    if (!line.startsWith("|")) return [];
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (!cells[0] || cells[0].startsWith("---") || ["Check", "State"].includes(cells[0])) return [];
    return [{ group, cells: cells.length === 3 ? [cells[0]!, cells[1]!, "Preserve the owning module contract", cells[2]!] : cells }];
  });
}
const MEASUREMENT_ROWS = specificationRows(kitSource, "## 7 ·", "## 8 ·");
const UX_ROWS = specificationRows(kitSource, "## §2.2 ·", "**Feedback:**");

const COLOUR_TOKENS = [
  ["Page ground", "--c-ground"],
  ["Surface", "--c-card"],
  ["Table header", "--c-band"],
  ["Primary text", "--c-ink"],
  ["Body text", "--c-body"],
  ["Secondary text", "--c-secondary"],
  ["Border", "--c-card-border"],
  ["Table row line", "--c-row-line"],
  ["Selected tab", "--c-select-bg"],
  ["Selection text", "--c-select-fg"],
  ["Button hover", "--c-btn-hover"],
  ["Main action", "--c-main"],
  ["Selected row", "--c-select-bg"],
  ["Row hover", "--c-row-hover"],
  ["Keyboard focus", "--c-focus"],
  ["Open frame", "--c-open-frame"],
  ["Done surface", "--c-ok-bg"],
  ["Done text", "--c-ok-fg"],
  ["Needs action surface", "--c-warn-bg"],
  ["Needs action text", "--c-warn-fg"],
  ["Neutral pill", "--c-info-bg"],
  ["Hold", "--c-hold-bg"],
  ["None surface", "--c-search-bg"],
  ["None text", "--c-secondary"],
] as const;

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

/* ── the one listing engine in the v12 look, with the Sales Order view's columns and TEST rows ── */
const COLUMNS: CListColumn[] = [
  { key: "proceed", label: "Proceed date", width: "120px" },
  { key: "order", label: "SO no.", width: "minmax(150px,1fr)" },
  { key: "items", label: "Items", width: "120px" },
  { key: "channel", label: "Sales location", width: "minmax(120px,1fr)" },
  { key: "dloc", label: "Delivery location", width: "minmax(170px,1fr)" },
  { key: "reqDate", label: "Customer’s original requested delivery", head: ["Customer’s original", "requested delivery"], width: "140px" },
];
type Row = { id: string; cells: Record<string, CCell> };
const ROWS: Row[] = [
  {
    id: "t1",
    cells: {
      proceed: { t: "11 Oct", sub: "Sun", subTone: "muted", fw: 500 },
      order: { t: "SO-TEST-01", sub: "TEST · Customer A", fw: 600, fg: "ink" },
      items: { t: "3 pcs", sub: "MS, Pillow", subTitle: "Mattress, Pillow" },
      channel: { t: "TEST Showroom A", sub: "TEST · Staff A" },
      dloc: { t: "Setapak", sub: "Kuala Lumpur" },
      reqDate: { t: "19 Nov", sub: "Thu", subTone: "muted", fw: 500 },
    },
  },
  {
    id: "t2",
    cells: {
      proceed: { t: "28 Aug", sub: "Fri", subTone: "muted", fw: 500 },
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
      proceed: { t: "2 Oct", sub: "Fri", subTone: "muted", fw: 500 },
      order: { t: "SO-TEST-03", sub: "TEST · a customer name long enough to end with an ellipsis", subClip: true, subTitle: "TEST · a customer name long enough to end with an ellipsis", fw: 600, fg: "ink" },
      items: { t: "2 pcs" },
      channel: { t: "Could not read", fg: "warn", title: "Could not read Sales for this order. This does not mean nothing is recorded." },
      dloc: { t: "Johor Bahru", sub: "Johor" },
      reqDate: { t: "6 Oct", sub: "Tue · Delivered", subTone: "ok", fw: 500 },
    },
  },
];
const LONG_QTY: CListTotals = {
  lead: "Qty:",
  parts: ["Mattress 23", "Pillow 10", "Bedframe 14", "Mattress protector 4", "Sofa 22 sets", "Others 1"],
  short: ["MS 23", "Pillow 10", "BF 14", "M.P 4", "SOF 22 sets", "Others 1"],
};

const GRID_COLUMNS: DataGridColumn<Row>[] = COLUMNS.map((c) => ({
  key: c.key,
  label: c.head ? c.head[0] : c.label,
  ...(c.head ? { headerSub: c.head[1] } : {}),
  exportLabel: c.label,
  width: trackFloor(c.width),
  minWidth: trackFloor(c.width),
  sortable: true,
  accessor: (r: Row) => (
    <span className="flex min-w-0 flex-col items-start leading-[1.3]">
      <CListCell cell={r.cells[c.key]!} />
    </span>
  ),
  filterValue: (r: Row) => r.cells[c.key]!.t,
  searchValue: (r: Row) => r.cells[c.key]!.t,
  exportValue: (r: Row) => r.cells[c.key]!.t,
}));
const ITEMS = [
  { key: "a", name: "TEST · Mattress model A", detail: "Queen · TEST-MS-A", qty: "1 pc" },
  { key: "b", name: "TEST · Pillow model B", detail: "Standard · TEST-PL-B", qty: "2 pcs" },
];

function TableExample({ narrow }: { narrow: boolean }) {
  const [picked, setPicked] = useState<Set<string>>(new Set(["t2"]));
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  return (
    <section className="grid max-w-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]" style={{ width: narrow ? 560 : "100%", height: 300 }} data-carres-table="list" aria-label={narrow ? "TEST list, narrow" : "TEST list"}>
      <DataGrid<Row>
        rows={ROWS}
        columns={GRID_COLUMNS}
        storageKey={`carres.ui.table.${narrow ? "narrow" : "wide"}.v1`}
        rowKey={(r) => r.id}
        rowHeight={44}
        appearance="reference"
        palette="slate"
        hideToolbar
        fitContent
        searchPresentation="none"
        allowColumnGrouping={false}
        stickyIdentity={{ columnKey: "order" }}
        selectable={{
          selectedKeys: picked,
          onToggle: (key) =>
            setPicked((s) => {
              const n = new Set(s);
              if (n.has(key)) n.delete(key);
              else n.add(key);
              return n;
            }),
          onToggleAll: (keys, all) => setPicked(all ? new Set(keys) : new Set()),
          rowLabel: (r: Row) => `Select ${r.cells.order!.t}`,
        }}
        expandable={{
          flush: true,
          frame: true,
          defaultExpandedKeys: narrow ? [] : ["t1"],
          label: (_r, isOpen) => (isOpen ? "Hide items" : "Show items"),
          renderExpansion: (r) => (
            <ItemRows label={r.cells.order!.t} stepBack={0}>
              <div role="row" className="grid h-10 grid-cols-[minmax(0,1fr)_120px] items-center bg-c-band px-[5px] text-meta font-medium text-c-secondary">
                <span role="columnheader">Item</span>
                <span role="columnheader">Qty</span>
              </div>
              {ITEMS.map((it) => (
                <div key={it.key} role="row" className="grid min-h-[44px] grid-cols-[minmax(0,1fr)_120px] items-center border-t border-c-row-line bg-c-card px-[5px] py-1">
                  <span role="cell" className="flex min-w-0 flex-col leading-[1.3]">
                    <span className="text-body text-c-ink">{it.name}</span>
                    <span className="text-meta text-c-secondary">{it.detail}</span>
                  </span>
                  <span role="cell" className="text-body tabular-nums text-c-ink">{it.qty}</span>
                </div>
              ))}
            </ItemRows>
          ),
        }}
        statusSummary={() => (
          <CListFooter count="3 orders" totals={LONG_QTY} pageSize={size} onPageSize={setSize} page={page} pages={2} onPage={setPage} />
        )}
      />
    </section>
  );
}

/* ── the order-line table in a card (01 §5.1), with TEST lines: a long name, a free item, a service ── */
const ORDER_LINES: COrderLine[] = [
  { key: "a", model: "TEST · Mattress model A", spec: "Queen · TEST-MS-A", qty: 2, unitPrice: "RM 1,890.00", amount: "RM 3,780.00" },
  { key: "b", model: "TEST · a product name long enough to need sixty characters XL", spec: "Super single · Mattress gap: Confirm later · TEST-MS-LONG-CODE", qty: 1, unitPrice: "RM 12,345.50", amount: "RM 12,345.50" },
  { key: "c", model: "TEST · Pillow model B", spec: "Standard · TEST-PL-B", qty: 1, unitPrice: "RM 0.00", amount: "RM 0.00",
    notes: <span className="text-[12px] text-c-secondary">Free item. It follows the item it came with</span> },
  { key: "d", model: "TEST · Delivery fee", spec: "TEST-DELIVERY", qty: 1, unitPrice: "RM 250.00", amount: "RM 250.00" },
];

function OrderLinesExample({ narrow }: { narrow: boolean }) {
  return (
    <div className="flex max-w-full min-w-0 flex-col rounded-lg border border-c-card-border bg-c-card px-4 py-3.5" style={{ width: narrow ? 420 : "100%" }}>
      <h3 className="pb-1.5 text-strong text-c-ink">Items</h3>
      <COrderLines
        label={narrow ? "TEST items, narrow" : "TEST items"}
        lines={ORDER_LINES}
        totals={[
          { key: "total", label: "Total", strong: true, qty: 5, amount: "RM 16,375.50" },
          { key: "received", label: "Received", amount: "RM 2,999.50" },
          { key: "balance", label: "Balance due", strong: true, warn: true, amount: "RM 13,376.00" },
        ]}
      />
    </div>
  );
}

/* ── cells and pills: every state a cell can be in ── */
const CELLS: Array<[string, CCell]> = [
  ["Identifier", { t: "SO-TEST-01", sub: "TEST · Customer A", fw: 600, fg: "ink" }],
  ["Date", { t: "11 Oct", sub: "Sun", subTone: "muted", fw: 500 }],
  ["Read, nothing there", { t: "Not recorded", fg: "muted" }],
  ["Read failed", { t: "Could not read", fg: "warn", title: "Could not read Payments for this order. This does not mean there is no receipt." }],
  ["No access", { t: "No access", fg: "muted", title: "You may not see this record." }],
  ["Done", { t: "6 Oct", sub: "Tue · Delivered", subTone: "ok", fw: 500 }],
  ["Money", { t: "RM 14,170", align: "end" }],
  ["Pill", { t: "Owes", pill: true, tone: "warn" }],
];
const TONES: CPillTone[] = ["ok", "warn", "info", "blocked", "select"];

/* ── current shared controls ── */
const CARRIERS = [
  { value: "nets", label: "NETS" },
  { value: "houzs", label: "HOUZS" },
  { value: "retired", label: "TEST · retired carrier", disabled: true },
];

function Sample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] text-c-secondary">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Panel2({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6 rounded-lg border border-c-card-border bg-c-card p-5">{children}</div>;
}

function PdfPreviewSample() {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  async function openSample(broken: boolean) {
    setLoading(true);
    try {
      const { renderPoPdf } = await import("@/lib/pdf/render");
      const blob = broken ? new Blob(["Unavailable document"], { type: "application/pdf" }) : await renderPoPdf({
        draft: true, po_number: "DRAFT", po_id: "", version: 0, issue_date: "2026-09-24",
        supplier: { name: "TEST supplier", address: "TEST address", contact: null },
        destination: { name: "TEST destination", address: "TEST warehouse address" },
        delivery_instructions: null, eta_date: "2026-10-02", terms: null,
        lines: [{ sku: "TEST", description: "TEST item", qty: 2, unit: "unit" }],
      });
      setSrc(URL.createObjectURL(blob));
    } finally { setLoading(false); }
  }
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap gap-2">
      <Button loading={loading} onClick={() => void openSample(false)}>Show preview</Button>
      <Button disabled={loading} onClick={() => void openSample(true)}>Show failed preview</Button>
    </div>
    {src && <div className="flex h-[70vh] min-w-0 bg-c-ground p-4"><PdfPreview src={src} title="TEST document" /></div>}
  </div>;
}

function SavedEvidenceSample() {
  const [active, setActive] = useState<string | null>(null);
  return <>
    <Button onClick={() => setActive("example")}>View</Button>
    <SavedEvidenceViewer activeId={active} onClose={() => setActive(null)}
      files={[
        { id: "example", kind: "photo", url: "/carres-logo.png", context: "TEST · Arrival evidence", unitCodes: ["U1-000-001"] },
        { id: "unreadable", kind: "photo", url: null, context: "TEST · Arrival evidence" },
      ]}
      onRetry={async (id) => (id === "example" ? "/carres-logo.png" : null)} />
  </>;
}

function SharedParts() {
  const [carrier, setCarrier] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState(true);
  const [date, setDate] = useState<string | null>("2026-10-19");
  const [view, setView] = useState("open");
  const [sampleAction, setSampleAction] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  return (
    <>
      <header className="flex flex-col gap-1 border-t border-c-section-line pt-8">
        <h2 className="text-strong text-c-ink">Shared controls</h2>
        <p className="text-[13px] text-c-secondary">
          Current form, menu, feedback, document and task components. All examples use TEST data; actions here do not save business records.
        </p>
      </header>

      <Section id="complete-pages" title="Complete pages" note="Development fixtures using actual page components. These examples do not prove saved records, production permissions or completed business actions.">
        <nav aria-label="Complete page previews" className="flex flex-col gap-3 text-body">
          <a className="underline underline-offset-4" href="/sales-orders-shell-preview.html">Sales Order · list and record opening</a>
          <a className="underline underline-offset-4" href="/sales-orders-shell-preview.html?scenario=empty">Sales Order · genuinely empty list</a>
          <a className="underline underline-offset-4" href="/sales-orders-shell-preview.html?scenario=search-empty&amp;search=TEST-NONE&amp;total=unknown">Sales Order · empty search with unknown total</a>
          <a className="underline underline-offset-4" href="/sales-orders-shell-preview.html?scenario=population-retry&amp;search=TEST-NONE&amp;total=unknown">Sales Order · population read failure and retry</a>
          <a className="underline underline-offset-4" href="/sales-orders-shell-preview.html?scenario=failed">Sales Order · list read failure</a>
          <a className="underline underline-offset-4" href="/sales-orders-shell-preview.html?scenario=denied">Sales Order · list access denied</a>
          <a className="underline underline-offset-4" href="/so-workspace-shell-preview.html">Sales Order · full shell and detail</a>
          <a className="underline underline-offset-4" href="/so-workspace-shell-preview.html?state=empty">Sales Order · no payments recorded</a>
          <a className="underline underline-offset-4" href="/so-workspace-shell-preview.html?state=forbidden">Sales Order · payment access denied</a>
          <a className="underline underline-offset-4" href="/so-workspace-shell-preview.html?state=route-failed">Sales Order · Route read failure</a>
          <a className="underline underline-offset-4" href="/so-workspace-shell-preview.html?state=tasks-failed">Sales Order · Tasks read failure</a>
          <a className="underline underline-offset-4" href="/route-preview.html">Order Route · standalone implementation example</a>
          <a className="underline underline-offset-4" href="/work-preview.html?shell=1&pw=1&at=%2Foperation%3Ftab%3Dwork">Workspace · My Task and Team Work</a>
          <a className="underline underline-offset-4" href="/so-batch-shell-preview.html">Tasks · list and open task</a>
        </nav>
        <p className="text-meta text-c-secondary">Check complete pages at 1025, 1164 and 1440 wide, with applicable narrow and zoom states. The standalone Route shows existing implementation, not an approved replacement for the current Route composition. Acceptance is recorded in the existing delivery handoff.</p>
      </Section>

      <Section id="buttons" title="Buttons" note="Main, normal and quiet; 32 high in the desktop toolbar role, at least 44 on a narrow screen. One main button per area. Destructive commands use a clear action name.">
        <Panel2>
          <Sample label="main · normal · quiet">
            <Button variant="primary">Issue PO</Button>
            <Button onClick={() => setSampleAction("TEST · Preview selected")}>Preview</Button>
            <Button variant="ghost" onClick={() => setSampleAction("")}>Cancel</Button>
          </Sample>
          <Sample label="with an icon · small · icon only (named)">
            <Button icon="print">Print</Button>
            <Button size="sm" icon="add">Add</Button>
            <Button iconOnly icon="overflow" aria-label="More actions" />
          </Sample>
          <Sample label="disabled · busy">
            <Button variant="primary" disabled>Issue PO</Button>
            <Button loading>Saving</Button>
          </Sample>
        </Panel2>
      </Section>

      <Section id="fields" title="Fields" note="One field skin: label above, hint under, an error replaces the hint and keeps what was typed.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel2>
            <Input id="ui-k-in" label="Sales order" hint="The number on the customer's copy" defaultValue="SO-TEST-01" />
            <Input id="ui-k-err" label="Phone" required defaultValue="01" error="Enter a Malaysian mobile number" />
            <Select id="ui-k-sel" label="Logistics" placeholder="Pick a carrier" options={CARRIERS} value={carrier} onValueChange={setCarrier} />
            <SearchInput id="ui-k-search" />
          </Panel2>
          <Panel2>
            <Textarea id="ui-k-ta" label="Note (optional)" placeholder="What happened" />
            <DatePicker id="ui-k-date" label="Delivery date" value={date} onChange={setDate} />
            <Checkbox id="ui-k-cb" label="Owing" checked={picked} onCheckedChange={(v) => setPicked(v === true)} />
          </Panel2>
        </div>
      </Section>

      <Section id="menus" title="Menus and pop-ups" note="One pop-up, CPopover: as a menu (CMenu, items as data: ↓, Enter or Space opens it on its first command, ↑ ↓ Home End move, Escape or Tab closes it and focus goes back to its button; a menu carries no colour) and as a small panel (a filter, a calendar, a list of links). Inside a dialog it opens within the dialog.">
        <Panel2>
          <Sample label="⋮ menu">
            <CMenu
              label="Row actions"
              trigger={<Button iconOnly icon="overflow" aria-label="Row actions" />}
              items={[
                { key: "print", label: "Print", icon: "print", onSelect: () => setSampleAction("TEST · Print selected") },
                { key: "copy", label: "Copy reference", icon: "copy", onSelect: () => setSampleAction("TEST · Copy reference selected") },
                { key: "cancel", label: "Cancel order", separatorBefore: true, disabled: true, onSelect: () => setSampleAction("TEST · Cancel selected; no record changed") },
              ]}
            />
            <CPopover label="Filters" trigger={<Button icon="filter">Filter</Button>}>
              <div className="flex w-56 flex-col gap-2">
                <Checkbox id="ui-k-f1" label="Owing" checked={picked} onCheckedChange={(v) => setPicked(v === true)} />
              </div>
            </CPopover>
            <Tooltip content="Already past that deadline">
              <Button iconOnly icon="late" aria-label="Late" />
            </Tooltip>
          </Sample>
        </Panel2>
      </Section>

      <Section id="tabs-kit" title="Tabs" note="The grey segmented control: exactly one is on.">
        <Panel2>
          <Tabs label="Sample views" value={view} onValueChange={setView} tabs={[{ value: "open", label: "Open" }, { value: "delivered", label: "Delivered" }, { value: "all", label: "All" }]} />
        </Panel2>
      </Section>

      <Section id="dialogs" title="Dialogs and drawers" note="Use a dialog for a focused form and a drawer for supporting context. Ordinary dialogs close on Escape. A task-wide review keeps its owning Save and Cancel as the only exits. Closing returns focus to the trigger.">
        <Panel2>
          <Sample label="open them">
            <Button variant="primary" onClick={() => setModalOpen(true)}>Open a modal</Button>
            <Button onClick={() => setDrawerOpen(true)}>Open a drawer</Button>
            <Button onClick={() => setReviewOpen(true)}>Open task review</Button>
          </Sample>
        </Panel2>
        <Modal
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="TEST · Form preview"
          footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => setModalOpen(false)}>Save</Button></>}
        >
          <Select id="ui-k-modal-sel" label="Logistics" placeholder="Pick a carrier" options={CARRIERS} value={carrier} onValueChange={setCarrier} />
        </Modal>
        <Drawer variant="quick-view" open={drawerOpen} onOpenChange={setDrawerOpen} title="SO-TEST-01 · TEST Customer A">
          <div className="flex flex-col gap-4">
            <p className="text-body text-c-secondary">TEST · Supporting document context</p>
          </div>
        </Drawer>
        <Modal open={reviewOpen} onOpenChange={setReviewOpen} title="TEST · Task review" variant="task-review">
          <TaskWideSurface title="TEST · Task review" about="SO-TEST-01">
            <div className="flex flex-col gap-4">
              <Input id="ui-k-review-note" label="Note (optional)" />
              <div className="flex gap-2"><Button variant="primary" onClick={() => setReviewOpen(false)}>Save</Button><Button onClick={() => setReviewOpen(false)}>Cancel</Button></div>
            </div>
          </TaskWideSurface>
        </Modal>
      </Section>

      <Section id="states" title="Feedback states" note="Empty, failed and no access are three different sentences, never one.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel2><EmptyState icon="search" title="No orders match this filter" detail="Clear a filter to see the rest." /></Panel2>
          <Panel2><EmptyState icon="late" title="Could not be loaded" detail="TEST · Failed read. Retry keeps the current context." action={<Button variant="primary" icon="refresh">Try again</Button>} /></Panel2>
          <Panel2><EmptyState icon="lock" title="No access" detail="TEST · Restricted content is unavailable." /></Panel2>
        </div>
        <Panel2><Loading variant="skeleton" /></Panel2>
      </Section>

      <Section id="documents" title="Documents and evidence" note="The real rendered document, fit to width, with loading and retry. Saved photos and video stay read only.">
        <Panel2>
          <PdfPreviewSample />
          <Sample label="saved evidence"><SavedEvidenceSample /></Sample>
        </Panel2>
      </Section>

      <Section id="task-parts" title="Task view and steps" note="One shared task view. The owning module supplies its facts and work; this TEST example records nothing.">
        <div className="max-w-[420px] rounded-lg border border-c-card-border bg-c-card p-4">
          <TaskView
            title="Record supplier answer"
            moduleIcon="shopping_cart"
            page="Purchasing"
            record="PO-TEST-01"
            openRecordLabel="Preview PO-TEST-01"
            onOpenRecord={() => setSampleAction("TEST · PO-TEST-01 selected")}
            owner="TEST Staff"
            tabsLabel="Task sections"
            facts={[
              { key: "deadline", icon: "event", label: "Deadline", value: "15 Oct · Thu" },
              { key: "contact", icon: "forum", label: "Contact", value: "TEST Supplier" },
            ]}
            tabs={[
              { key: "steps", label: "Steps", content: (
                <StepList aria-label="TEST supplier answer">
                  <Step n={1} state="done" title="Check the source" sub="TEST · Source checked" />
                  <Step n={2} state="current" title="Record the answer" sub="TEST · The owning module supplies its form" />
                </StepList>
              ) },
              { key: "history", label: "History", content: <p className="text-body text-c-secondary">TEST · No recorded changes</p> },
            ]}
          />
        </div>
      </Section>
      <p role="status" aria-label="TEST action result" className="text-body text-c-secondary">{sampleAction}</p>
    </>
  );
}

export default function UiShowcase() {
  const [colourValues, setColourValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const refresh = () => {
      const computed = getComputedStyle(document.documentElement);
      setColourValues(Object.fromEntries(COLOUR_TOKENS.map(([, token]) => [token, computed.getPropertyValue(token).trim()])));
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);

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
          One shared standard for every Carres page: colours, typography, dimensions, components and page compositions. Use these shared components; do not create a page-specific kit. Examples use TEST data. Rules: docs/ui/MASTER.md.
        </p>
      </header>

      <nav aria-label="Kit sections" className="grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-6 lg:grid-cols-9">
        {[["colours", "Colours"], ["typography", "Typography"], ["measurements", "Dimensions"], ["ux-rules", "UX rules"], ["table", "Tables"], ["cells", "Table cells"], ["order-lines", "Order lines"], ["pills", "Pills"], ["toolbar", "Toolbar"], ["side-panel", "Side panel"], ["icons", "Icons"], ["complete-pages", "Complete pages"], ["buttons", "Buttons"], ["fields", "Fields"], ["menus", "Menus"], ["tabs-kit", "Tabs"], ["dialogs", "Dialogs"], ["states", "States"], ["documents", "Documents"], ["task-parts", "Tasks"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center text-body text-c-secondary underline decoration-c-chip-border underline-offset-2">{label}</a>
        ))}
      </nav>

      <Section id="colours" title="Colours" note="Swatches and printed values read the same shared runtime tokens, with no page-local palette. The one UI/UX MASTER owns the approved palette; themes change selection colours only. Status colours remain fixed. See the actual status components in Pills.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {COLOUR_TOKENS.map(([label, token]) => (
            <div key={label} className="flex min-w-0 flex-col gap-2 rounded-lg border border-c-card-border bg-c-card p-3">
              <span aria-hidden="true" className="h-11 rounded-lg border border-c-card-border" style={token === "--c-focus" ? { outline: `var(${token})` } : { background: `var(${token})` }} data-token={token} />
              <span className="text-meta text-c-ink">{label}</span>
              <span className="text-meta font-medium">{colourValues[token] || token}</span>
              <span className="break-words text-meta text-c-secondary">{token}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="typography" title="Typography" note="Inter. The page heading above shows the 20/600 title once. Samples below use the running shared classes; the UI/UX MASTER owns the permitted roles. Table numbers use tabular figures.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[["11 / 700 · Card title", "text-label font-bold uppercase tracking-[.08em]", "Customer"], ["14 / 400 · Breadcrumb", "text-control", "Sales Orders"], ["13 / 400 · Body", "text-body", "TEST · Order details"], ["13 / 500 · Selected or field value", "text-body font-medium", "TEST · Selected value"], ["13 / 600 · Identifier or main action", "text-body font-semibold", "SO-TEST-01"], ["12 / 400 · Label or second line", "text-meta", "TEST · Customer A"], ["11 / 600 · Table header", "text-label font-semibold uppercase tracking-[.04em]", "Proceed date"], ["11 / 500 · Caps label", "text-label uppercase tracking-[0.06em]", "Summary"], ["11 / 700 · Count badge", "text-label font-bold", "12"]].map(([label, className, sample]) => (
            <div key={label} className="flex min-w-0 flex-col gap-2 rounded-lg border border-c-card-border bg-c-card p-3">
              <span className="text-meta text-c-secondary">{label}</span>
              <span className={`${className} text-c-ink`} data-type-sample={label}>{sample}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="measurements" title="Dimensions and usage" note="The full checklist below reads directly from the one UI/UX MASTER. Each item gives its approved value, trigger and shared entry. Units: CSS px. UNRESOLVED means no approved value exists; it must not be guessed.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {MEASUREMENT_ROWS.map(({ group, cells }) => (
            <div key={`${group}-${cells[0]}`} className="flex min-w-0 flex-col gap-2 rounded-lg border border-c-card-border bg-c-card p-3">
              <p className="text-meta text-c-secondary">{group}</p>
              <h3 className="text-body font-medium">{cells[0]}</h3>
              <dl className="flex flex-col gap-2 text-meta">
                <div><dt className="text-c-secondary">Approved value / contract</dt><dd>{cells[1]}</dd></div>
                <div><dt className="text-c-secondary">Trigger / behaviour</dt><dd>{cells[2]}</dd></div>
                {cells[3] && <div><dt className="text-c-secondary">Shared entry</dt><dd className="break-words">{cells[3]}</dd></div>}
              </dl>
            </div>
          ))}
        </div>
      </Section>

      <Section id="ux-rules" title="UX rules" note="Required state behaviour from the one UI MASTER §2.2. Components demonstrate appearance; the owning module supplies facts, permission and the actual saved result.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {UX_ROWS.map(({ cells }) => (
            <div key={cells[0]} className="flex min-w-0 flex-col gap-2 rounded-lg border border-c-card-border bg-c-card p-3">
              <h3 className="text-body font-medium">{cells[0]}</h3>
              <p className="text-meta">{cells[1]}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="table" title="Shared table · DataGrid" note="Uppercase 40 header · minimum44 rows, growing for complete facts · ▸ and tick 24 · gap 10 · a column is as wide as its longest value · ▸, tick and the identifier stay while the list scrolls in its own box · ▸ opens the items on the row's own columns · the footer takes two lines at most, short forms when the full words need a third, and never widens the list.">
        <TableExample narrow={false} />
        <TableExample narrow />
      </Section>

      <Section id="cells" title="Table cells" note="Main words, then the grey second line, each on one line. A long value widens its column and the list scrolls sideways in its own box; only a customer's name ends with … when its column is short, the full name on hover. A date has no year in this year. Three states are never merged: read and empty, read failed, no access.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CELLS.map(([name, cell]) => (
            <div key={name} className="flex flex-col gap-1.5 rounded-lg border border-c-card-border bg-c-card p-3">
              <span className="text-[12px] text-c-secondary">{name}</span>
              <span className={`flex min-w-0 flex-col leading-[1.3] text-[13px] ${cell.align === "end" ? "items-end" : "items-start"}`}>
                <CListCell cell={cell} />
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="order-lines" title="Order-line table in a card: COrderLines" note="A record's goods and services (the Sales Order's Items). Grey 40 header · rows 44, the item on two lines, model then spec, neither wraps · # 20 · item · Qty 32 · Unit price 80 · Amount 80, gap 10; a number column widens to its longest value · an exception note wraps under the item and only that row grows · totals close the table · on a narrow card the table scrolls sideways inside the card, never the page.">
        <OrderLinesExample narrow={false} />
        <OrderLinesExample narrow />
      </Section>

      <Section id="pills" title="Pills" note="12/500, the full word, never cut.">
        <div className="flex flex-wrap items-center gap-2">
          {TONES.map((t) => (
            <CPill key={t} tone={t}>{t === "ok" ? "Paid" : t === "warn" ? "Owes" : t === "info" ? "Open" : t === "blocked" ? "Hold delivery" : "Selected"}</CPill>
          ))}
        </div>
      </Section>

      <Section id="toolbar" title="List toolbar" note="One 36px line, every button 32 high: show a hidden panel · the views · filter chips · view (its name always shown) and ⋮ · Tasks. Too short a line keeps the show-panel button's icon only.">
        <div className="max-w-full overflow-x-auto">
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
            <CViewButton icon="receipt_long" name="Sales Order" />
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
        </div>
      </Section>

      <Section id="side-panel" title="Side panel" note="The Summary frame: 36px title row; body starts at 36 + 10. In the module Shell below1100, the same content opens in the shared264px Drawer; Tasks uses340px. Inputs and scroll survive resizing.">
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
                  <span className="font-medium tabular-nums text-c-ink">{v}</span>
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

      <SharedParts />

    </main>
  );
}
