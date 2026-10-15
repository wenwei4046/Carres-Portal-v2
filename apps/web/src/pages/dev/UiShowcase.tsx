/**
 * `/ui` — THE Carres UI kit, live (UI MASTER, owner ruling 14 Oct 2026: one kit,
 * in code; the look is Sales Order Outright v12, "this is the last").
 *
 * Every part below is the real component the pages import, rendered with TEST
 * data. Design checks this page against v12 once; after that every page is built
 * from these parts only. The earlier kit that stood here (the July decisions, the
 * slate tokens and their components) is replaced, not kept beside it: one kit.
 *
 * The second half, "Shared parts the pages use", is every other shared component
 * the Portal's pages import today (counted 15 Oct 2026), led by the one listing
 * engine, DataGrid. Where two components still do one job, both are shown and the
 * last section names the merge that is owed: one kit means nothing hides here.
 */
import { useEffect, useState, type ReactNode } from "react";
import MIcon from "@/components/carres/MIcon";
import CPill, { type CPillTone } from "@/components/carres/CPill";
import CPopover, { CMenu, CMenuGroup, CMenuItem } from "@/components/carres/CPopover";
import { CListCell, trackFloor, type CCell, type CListColumn } from "@/components/carres/CCell";
import { CListFooter, type CListTotals } from "@/components/carres/CListFooter";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ItemRows from "@/components/register/ItemRows";
import CSidePanel from "@/components/carres/CSidePanel";
import { CChip, CIconButton, CShowPanelButton, CViewButton } from "@/components/carres/CToolbar";
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON, SEGMENTED_TRACK } from "@/components/kit/Tabs";
import { TasksPill, useShellTasks } from "@/pages/operation/components/ShellTasks";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import Drawer from "@/components/kit/Drawer";
import EmptyState from "@/components/kit/EmptyState";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Modal from "@/components/kit/Modal";
import PdfPreview from "@/components/kit/PdfPreview";
import RouteStop from "@/components/kit/RouteStop";
import SavedEvidenceViewer from "@/components/kit/SavedEvidenceViewer";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import StepList, { Step } from "@/components/kit/StepList";
import Tabs from "@/components/kit/Tabs";
import TaskView from "@/components/kit/TaskView";
import Textarea from "@/components/kit/Textarea";
import Tooltip from "@/components/kit/Tooltip";
import { TONES as STATUS_TONES } from "@/components/kit/tokens";
import ListOptionsExample from "@/pages/dev/ListOptionsExample";
import ServerRegisterExample from "@/pages/dev/ServerRegisterExample";
import CompactCardExample from "@/pages/dev/CompactCardExample";

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
    <section className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]" style={{ width: narrow ? 560 : "100%", height: 300 }} data-carres-table="list" aria-label={narrow ? "TEST list, narrow" : "TEST list"}>
      <DataGrid<Row>
        rows={ROWS}
        columns={GRID_COLUMNS}
        storageKey={`carres.ui.table.${narrow ? "narrow" : "wide"}.v1`}
        rowKey={(r) => r.id}
        rowHeight={54}
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
            <ItemRows label={r.cells.order!.t}>
              <div role="row" className="grid h-8 grid-cols-[minmax(0,1fr)_120px] items-center bg-c-band px-[5px] text-meta font-medium text-c-secondary">
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

/* ── shared parts the pages use: every one is the component the pages import ── */
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
  const [view, setView] = useState("table");
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <header className="flex flex-col gap-1 border-t border-c-section-line pt-8">
        <h2 className="text-page">Shared parts the pages use</h2>
        <p className="text-[13px] text-c-secondary">
          Every component below is imported by Portal pages today; the count is how many pages import it (15 Oct 2026). All data is TEST.
        </p>
      </header>

      <Section id="list-engine" title="List engine: DataGrid (56 pages)" note="The one listing engine (UI MASTER §6.0, §6.2): Sales Orders register, SO Batch Purchase, Forecast Purchase, Purchase Orders, Receiving, Warehouse, Delivery, Payments, Finance and Workspace Tasks. Sort, per-column filters, Columns, grouping, resize, ticks and the selection bar, row expansion, export, list PDF, saved layouts, return context and the keyboard all live here once; a module passes its columns, rows, filters and actions.">
        <ListOptionsExample />
        <ServerRegisterExample />
      </Section>

      <Section id="buttons" title="Button (131 pages)" note="Main, normal and quiet; 32 high on a desktop, 40 where a finger presses. One main button per area. No danger button: a destructive command is a normal button whose word says what it does.">
        <Panel2>
          <Sample label="main · normal · quiet">
            <Button variant="primary">Issue PO</Button>
            <Button>Open order</Button>
            <Button variant="ghost">Cancel</Button>
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

      <Section id="fields" title="Fields: Input (49) · Select (72) · Textarea (29) · DatePicker (35) · Checkbox (23) · SearchInput (5)" note="One field skin: label above, hint under, an error replaces the hint and keeps what was typed.">
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

      <Section id="menus" title="Menu and pop-ups: CPopover · CMenu · Tooltip (5)" note="One pop-up, CPopover: as a menu (CMenu, items as data: ↓, Enter or Space opens it on its first command, ↑ ↓ Home End move, Escape or Tab closes it and focus goes back to its button; a menu carries no colour) and as a small panel (a filter, a calendar, a list of links). Inside a dialog it opens within the dialog.">
        <Panel2>
          <Sample label="⋮ menu">
            <CMenu
              label="Row actions"
              trigger={<Button iconOnly icon="overflow" aria-label="Row actions" />}
              items={[
                { key: "print", label: "Print", icon: "print", onSelect: () => {} },
                { key: "copy", label: "Copy reference", icon: "copy", onSelect: () => {} },
                { key: "cancel", label: "Cancel order", separatorBefore: true, onSelect: () => {} },
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

      <Section id="tabs-kit" title="Tabs (16 pages)" note="The grey segmented control: exactly one is on.">
        <Panel2>
          <Tabs label="Register presentation" value={view} onValueChange={setView} tabs={[{ value: "table", label: "Table" }, { value: "cards", label: "Cards" }]} />
        </Panel2>
      </Section>

      <Section id="dialogs" title="Modal (49) · Drawer (12)" note="A Modal asks one thing; a Drawer opens a record beside its list. Escape closes both and focus returns to the button that opened them.">
        <Panel2>
          <Sample label="open them">
            <Button variant="primary" onClick={() => setModalOpen(true)}>Open a modal</Button>
            <Button onClick={() => setDrawerOpen(true)}>Open a drawer</Button>
          </Sample>
        </Panel2>
        <Modal
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="Record the delay decision"
          footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => setModalOpen(false)}>Save</Button></>}
        >
          <Select id="ui-k-modal-sel" label="Logistics" placeholder="Pick a carrier" options={CARRIERS} value={carrier} onValueChange={setCarrier} />
        </Modal>
        <Drawer variant="quick-view" open={drawerOpen} onOpenChange={setDrawerOpen} title="SO-TEST-01 · TEST Customer A">
          <div className="flex flex-col gap-4">
            <Block title="Delivery"><p className="text-body">Not recorded</p></Block>
            <Block title="Items"><p className="text-body">No items on this order</p></Block>
          </div>
        </Drawer>
      </Section>

      <Section id="states" title="States: EmptyState (16) · Loading (18)" note="Empty, failed and no access are three different sentences, never one.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel2><EmptyState icon="search" title="No orders match this filter" detail="Clear a filter to see the rest." /></Panel2>
          <Panel2><EmptyState icon="late" title="This did not load" detail="The connection dropped before the list arrived." action={<Button variant="primary" icon="refresh">Try again</Button>} /></Panel2>
          <Panel2><EmptyState icon="lock" title="You cannot open this" detail="Ask a manager for access." /><Loading variant="skeleton" /></Panel2>
        </div>
      </Section>

      <Section id="status-pill" title="StatusPill (19 pages)" note="The status pill the object pages and older lists use, in the action engine's tone words. It draws from the same shape and colour pairs as the list's CPill (above): one pill, changed in one place.">
        <Panel2>
          <Sample label="every tone">
            {STATUS_TONES.map((tone) => <StatusPill key={tone} tone={tone}>{tone}</StatusPill>)}
          </Sample>
        </Panel2>
      </Section>

      <Section id="compact-card" title="Working Panel: CompactModuleCard (6 pages)" note="One card for every module's record beside its list: identity, the module's tabs, facts with their editors, items, Communication and Timeline (UI MASTER §4.3). TEST sample.">
        <CompactCardExample />
      </Section>

      <Section id="documents" title="Documents: PdfPreview (11) · SavedEvidenceViewer (6)" note="The real rendered document, fit to width, with loading and retry. Saved photos and video stay read only.">
        <Panel2>
          <PdfPreviewSample />
          <Sample label="saved evidence"><SavedEvidenceSample /></Sample>
        </Panel2>
      </Section>

      <Section id="task-parts" title="Tasks: TaskView · StepList · RouteStop · Block" note="The one opened task (the Tasks panel and Workspace): the task, its record, one row per fact, then Steps · Route · History · Files. Placeholders in braces; a page fills them from records.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="max-w-[320px]">
            <TaskView
              title="{The task, as its list card says it}"
              moduleIcon="shopping_cart"
              page="{Page}"
              record="{Record}"
              openRecordLabel="Open {Record}"
              onOpenRecord={() => {}}
              owner="{Owner Name}"
              tabsLabel="Task sections"
              facts={[
                { key: "deadline", icon: "event", label: "Deadline", value: "{date · n days late}", warn: true },
                { key: "contact", icon: "forum", label: "Contact", value: "{party · channel}" },
              ]}
              tabs={[
                { key: "steps", label: "Steps", content: (
                  <StepList aria-label="{Job}">
                    <Step n={1} state="done" title="{Step done}" sub="{What was done}" />
                    <Step n={2} state="current" title="{Step to do now}" sub="{Finish when: …}" />
                  </StepList>
                ) },
                { key: "history", label: "History", content: <p className="text-body text-c-secondary">{"{What was recorded, newest first}"}</p> },
              ]}
            />
          </div>
          <div className="rounded-lg border border-c-card-border bg-c-card p-5">
            <RouteStop label="{Stop}" tone="due" last>
              <Block title="{What to do}" why={{ text: "{Why}", tone: "due" }}>
                <p className="text-body">{"{A fact}"}</p>
              </Block>
            </RouteStop>
          </div>
        </div>
      </Section>
    </>
  );
}

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

      <Section id="table" title="Carres Table" note="Sticky grey 40 header · 54 rows, every cell on one line · ▸ and tick 24 · gap 10 · a column is as wide as its longest value · ▸, tick and the identifier stay while the list scrolls in its own box · ▸ opens the items on the row's own columns · the footer takes two lines at most, short forms when the full words need a third, and never widens the list.">
        <TableExample narrow={false} />
        <TableExample narrow />
      </Section>

      <Section id="cells" title="Table cells" note="Main words, then the grey second line, each on one line. A long value widens its column and the list scrolls sideways in its own box; only a customer's name ends with … when its column is short, the full name on hover. A date has no year in this year. Three states are never merged: read and empty, read failed, no access.">
        <div className="grid grid-cols-4 gap-3">
          {CELLS.map(([name, cell]) => (
            <div key={name} className="flex flex-col gap-1.5 rounded-lg bg-c-card p-3 ring-1 ring-inset ring-c-card-border">
              <span className="text-[12px] text-c-secondary">{name}</span>
              <span className={`flex min-w-0 flex-col leading-[1.3] text-[13px] ${cell.align === "end" ? "items-end" : "items-start"}`}>
                <CListCell cell={cell} />
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

      <Section id="toolbar" title="List toolbar" note="One 36px line, every button 32 high: show a hidden panel · the views · filter chips · view (its name always shown) and ⋮ · Tasks. Too short a line keeps the show-panel button's icon only.">
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

      <SharedParts />

      <Section id="not-yet" title="Owed: one component per job" note="Where the Portal still has two parts for one job, or a part only one page draws. Each merges once, in the kit, and every page gets it.">
        <ul className="list-disc pl-5 text-[13px] text-c-body">
          <li>Carres Table (Sales Order Outright) and the list engine DataGrid draw one table twice: Sales Order Outright moves onto DataGrid, then Carres Table is deleted.</li>
          <li>The Summary side panel is drawn by Sales Order Outright only; SO Batch Purchase and the other lists still use the older filter rail.</li>
        </ul>
      </Section>
    </main>
  );
}
