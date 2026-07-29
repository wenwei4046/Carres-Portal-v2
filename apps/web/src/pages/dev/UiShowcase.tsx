/**
 * `/ui` — THE live showcase (UI-KIT's third body, card D0.5a).
 *
 * `docs/UI-KIT.md` explains what the kit means; `lib/design-standard.ts`
 * records it; **this page IS it.** It imports the real components and renders
 * the real tokens, so it structurally cannot describe something the code does
 * not do — which is the one failure the first two bodies cannot rule out.
 *
 * It carries THREE jobs:
 *   1. The FROZEN REGISTER. Q1 spacing · Q2 canvas · Q3 weight · Q4 icon stroke
 *      are recorded here with what each one costs. **D0.5a rendered them as a
 *      choice and Jess answered on 2026-07-28**; D0.5b replaced the comparison
 *      with the answer, because a page still asking a settled question is how a
 *      settled question gets re-opened.
 *   2. §9 UI STATES. Every component in every state, including the ugly ones —
 *      default · hover · focus · disabled · loading · error · long text ·
 *      empty value. §13.4 screenshots this page in CI, and a screenshot that
 *      only covers the happy path proves nothing.
 *   3. The token reference — type, colour, radius, spacing, icons, layers —
 *      rendered FROM the same records the components read.
 *
 * Two kinds of thing here cannot be photographed as they really are: a hover
 * needs a pointer, and a toast is gone in four seconds. Both are rendered in a
 * FORCED / static form beside the live one, and `UiShowcase.test.tsx` pins them
 * to the components' own declarations so they can never drift into a
 * hand-painted lookalike.
 */
import { useState, type ReactNode } from "react";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import Card from "@/components/kit/Card";
import Checkbox from "@/components/kit/Checkbox";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import DetailShell, { type IdentitySlot } from "@/components/kit/DetailShell";
import Drawer from "@/components/kit/Drawer";
import DropdownMenu from "@/components/kit/DropdownMenu";
import EmptyState from "@/components/kit/EmptyState";
import Icon, { ICON_NAMES } from "@/components/kit/Icon";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Modal from "@/components/kit/Modal";
import PageShell from "@/components/kit/PageShell";
import Panel from "@/components/kit/Panel";
import Popover from "@/components/kit/Popover";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import Tabs from "@/components/kit/Tabs";
import Textarea from "@/components/kit/Textarea";
import Toast from "@/components/kit/Toast";
import Tooltip from "@/components/kit/Tooltip";
import { Z_LADDER } from "@/components/kit/overlay-layer";
import {
  ICON_STROKE,
  RADII,
  SPACING_SCALE,
  TONES,
  TYPE_TOKENS,
  TYPE_WEIGHTS,
} from "@/components/kit/tokens";

/* Forced states — the same declarations the components carry, applied without
 * a pointer so CI can photograph them. Pinned by the test file. */
const FORCED_HOVER_PRIMARY = "[&>button]:brightness-95";
const FORCED_HOVER_NEUTRAL = "[&>button]:bg-kit-blue-3";
const FORCED_FOCUS_BUTTON = "[&>button]:ring-2 [&>button]:ring-kit-blue-9 [&>button]:ring-offset-1";
const FORCED_FOCUS_INPUT = "[&_input]:ring-2 [&_input]:ring-kit-blue-9 [&_input]:border-kit-blue-9";

const LONG =
  "Kuala Lumpur Sri Damansara warehouse transfer — customer requested the whole set delivered together";

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title text-kit-slate-12">{title}</h2>
        {note && <p className="text-meta text-kit-slate-11">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** One labelled sample. The label is the STATE, so a screenshot is readable. */
function Sample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label text-kit-slate-11">{label}</span>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-8 md:grid-cols-2">{children}</div>;
}

const CARRIERS = [
  { value: "nets", label: "NETS" },
  { value: "houzs", label: "HOUZS" },
  { value: "gai", label: "GAI (retired)", disabled: true },
];

/* D0.5c — the shells' demo data. Rows and words are made up on purpose: `/ui`
 * reads no session and fetches no row (that is why it can be public). */
interface DemoRow {
  id: string;
  ref: string;
  customer: string;
  owing: string;
}

const DEMO_ROWS: DemoRow[] = [
  { id: "1", ref: "SO-1256", customer: "Tan Wei Ming", owing: "2,000" },
  { id: "2", ref: "SO-1257", customer: "Lim Ah Kaw", owing: "480" },
  { id: "3", ref: "SO-1258", customer: "Nurul Aisyah", owing: "—" },
];

const DEMO_COLUMNS: Column<DemoRow>[] = [
  { key: "ref", label: "Order", width: 25, cell: (r) => <span className="font-mono">{r.ref}</span> },
  { key: "customer", label: "Customer", width: 40, cell: (r) => r.customer },
  {
    key: "status",
    label: "Status",
    width: 20,
    cell: () => (
      <StatusPill tone="warning" icon="waiting">
        Waiting
      </StatusPill>
    ),
  },
  { key: "owing", label: "Outstanding", width: 15, align: "right", numeric: true, cell: (r) => r.owing },
];

const ORDER_TABS = [
  { value: "open", label: "Open", count: 55 },
  { value: "delivered", label: "Delivered" },
];

const DEMO_IDENTITY: IdentitySlot = {
  primary: "Tan Wei Ming",
  /* §7② of the information model names the four, and the type caps the set:
   * 客户名 · Ref · the promised date · outstanding. */
  persistentFacts: [
    { label: "Customer", value: "Tan Wei Ming" },
    { label: "Ref", value: <span className="font-mono">SO-1256</span> },
    { label: "Promised", value: "27 Jul 26, Sun" },
    { label: "Outstanding", value: "RM 2,000" },
  ],
};

const DEMO_PROGRESS = {
  steps: [
    { id: "placed", label: "Placed", state: "done" as const },
    { id: "proceed", label: "Proceed", state: "done" as const },
    { id: "book", label: "To book", state: "current" as const },
    { id: "deliver", label: "Deliver", state: "todo" as const },
  ],
};

const DEMO_SECTIONS = [
  {
    id: "items",
    label: "Items",
    track: "goods" as const,
    children: <p className="text-body text-kit-slate-11">3 lines · 1 sofa · 2 mattresses</p>,
  },
  {
    id: "payment",
    label: "Payment",
    track: "money" as const,
    children: <p className="text-body text-kit-slate-11">RM 7,248 total · RM 5,248 collected</p>,
  },
];

const MODULE_TABS = [
  { value: "to-order", label: "To Order", count: 4 },
  { value: "purchase-orders", label: "Purchase Orders" },
  { value: "receiving", label: "Receiving", count: 12 },
  { value: "claims", label: "Claims" },
  { value: "settings", label: "Settings" },
];

export default function UiShowcase() {
  const [text, setText] = useState("SO-1256");
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [carrier, setCarrier] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState("to-order");
  const [ordersTab, setOrdersTab] = useState("open");
  const [picked, setPicked] = useState(true);
  const [some, setSome] = useState<boolean | "indeterminate">("indeterminate");
  const [date, setDate] = useState<string | null>("2026-07-19");

  return (
    <main className="min-h-screen bg-kit-slate-3 p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-page text-kit-slate-12">Carres UI-KIT</h1>
          <p className="text-body text-kit-slate-11">
            The live showcase. Every box below is the real component — if it renders here, it exists in
            the code. Read the law in <span className="font-mono">docs/UI-KIT.md</span>.
          </p>
        </header>

        {/* ─── 1 · FROZEN — what D0.5a asked, and what Jess answered ──────── */}
        <Section
          id="frozen"
          title="Frozen decisions"
          note="The PENDING REGISTER is empty. Jess answered Q1 · Q3 · Q4 on 2026-07-28; Q2 was frozen with the law. Nothing here is a question any more — it is the record."
        >
          <Panel title="The four answers">
            <div className="flex flex-col gap-4">
              {[
                ["Q1 · Spacing scale", "Candidate A — 8 steps (2 4 6 8 12 16 24 32)", "Keeps 2 and 6, so dense rows stay dense. ~779 sites to migrate — a third of the strict-4pt alternative."],
                ["Q2 · Page canvas", "Radix slate-3", "Frozen with the law on 2026-07-27."],
                ["Q3 · font-semibold (700)", "Deleted into 600", "The two were doing one job. 600 is the heavy weight; 158 uses fold in at D2."],
                ["Q4 · Icon stroke", `Lucide default — ${ICON_STROKE}`, "Icon has no strokeWidth prop, so a second stroke no longer compiles."],
              ].map(([q, answer, cost]) => (
                <div key={q} className="flex flex-col gap-1 border-b border-kit-slate-5 pb-4 last:border-0 last:pb-0">
                  <span className="text-label text-kit-slate-11">{q}</span>
                  <span className="text-strong text-kit-slate-12">{answer}</span>
                  <span className="text-meta text-kit-slate-11">{cost}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="§4.1 · the eight steps">
            <div className="flex flex-col gap-2">
              {SPACING_SCALE.map((s) => (
                <div key={s.px} className="flex items-center gap-4">
                  <span className="w-12 shrink-0 text-meta text-kit-slate-12 tabular-nums">{s.px}px</span>
                  <span className="w-12 shrink-0 font-mono text-meta text-kit-slate-11">{s.tailwind}</span>
                  {/* The bar's width IS the token, read from the record. This is
                   *  the one place an inline value is right — a page drawing a
                   *  width like this is inventing spacing, which §0.1 bans. */}
                  <span className="h-4 bg-kit-blue-9" style={{ width: s.px }} />
                  <span className="text-meta text-kit-slate-11">{s.use}</span>
                </div>
              ))}
              <p className="text-meta text-kit-slate-11">
                Dead under the frozen scale: 10 · 14 · 18 · 20 · 22 · 33 and every arbitrary value.
              </p>
            </div>
          </Panel>

          <Panel title="§2.2 · the three weights">
            <div className="flex flex-col gap-4">
              {TYPE_WEIGHTS.map((w) => (
                <Sample key={w} label={`${w}`}>
                  <span className="text-title text-kit-slate-12" style={{ fontWeight: w }}>
                    RM 56,859
                  </span>
                  <span className="text-strong text-kit-slate-12" style={{ fontWeight: w }}>
                    Delivery this week
                  </span>
                </Sample>
              ))}
              <p className="text-meta text-kit-slate-11">
                700 is not on this page because it is not in the kit. Q3 deleted it.
              </p>
            </div>
          </Panel>
        </Section>

        {/* ─── 2 · Tokens ─────────────────────────────────────────────────── */}
        <Section id="type" title="Typography — §2.1" note="Six tokens. Nothing above 24, nothing below 11.">
          <Card>
            <div className="flex flex-col gap-4">
              {TYPE_TOKENS.map((t) => (
                <div key={t.token} className="flex flex-wrap items-baseline gap-4">
                  <span className="w-40 shrink-0 font-mono text-meta text-kit-slate-11">{t.className}</span>
                  <span className={`${t.className} text-kit-slate-12`}>{t.use}</span>
                  <span className="text-meta text-kit-slate-11 tabular-nums">
                    {t.px} / {t.weight} / {t.lineHeight}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <Section
          id="colour"
          title="Colour — §3"
          note="The law names the STEP; the hex comes from @radix-ui/colors. Four jobs, and everything else is neutral."
        >
          <Grid>
            <Card>
              <div className="flex flex-col gap-4">
                <p className="text-strong text-kit-slate-12">Neutral — 95% of the screen</p>
                {[
                  ["slate-3", "bg-kit-slate-3", "page canvas"],
                  ["slate-5", "bg-kit-slate-5", "hairline"],
                  ["slate-6", "bg-kit-slate-6", "stronger divider"],
                  ["slate-9", "bg-kit-slate-9", "icon at rest"],
                  ["slate-11", "bg-kit-slate-11", "secondary text"],
                  ["slate-12", "bg-kit-slate-12", "primary text"],
                ].map(([step, cls, use]) => (
                  <div key={step} className="flex items-center gap-4">
                    <span className={`h-8 w-8 rounded-control border border-kit-slate-5 ${cls}`} />
                    <span className="font-mono text-meta text-kit-slate-12">{step}</span>
                    <span className="text-meta text-kit-slate-11">{use}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-4">
                <p className="text-strong text-kit-slate-12">The four jobs</p>
                {TONES.map((tone) => (
                  <div key={tone} className="flex items-center gap-4">
                    <StatusPill tone={tone}>{tone}</StatusPill>
                  </div>
                ))}
                <p className="text-meta text-kit-slate-11">
                  Red must stay rare or it stops meaning anything — a 15-row screen carries 0–2.
                </p>
              </div>
            </Card>
          </Grid>
        </Section>

        <Section id="radius" title="Radius — §4.2" note="Four, frozen. Named by use, so nobody picks a number.">
          <Card>
            <div className="flex flex-wrap gap-8">
              {RADII.map((r) => (
                <div key={r.className} className="flex flex-col items-center gap-2">
                  <span className={`h-16 w-16 border border-kit-slate-5 bg-kit-slate-3 ${r.className}`} />
                  <span className="font-mono text-meta text-kit-slate-12">{r.className}</span>
                  <span className="text-meta text-kit-slate-11">{r.use}</span>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <Section
          id="icons"
          title="Icons — §5.3"
          note="One meaning, one glyph. The name is the MEANING, never a Lucide import — a fifth name for `edit` does not compile."
        >
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6">
              {ICON_NAMES.map((name) => (
                <div key={name} className="flex items-center gap-2 text-kit-slate-11">
                  <Icon name={name} />
                  <span className="truncate text-meta">{name}</span>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        {/* ─── 3 · Components in every state — §9 ─────────────────────────── */}
        <Section
          id="button"
          title="Button — §6"
          note="One blue action per block. No danger variant: red is a state, not a control."
        >
          <Card>
            <div className="flex flex-col gap-8">
              <Sample label="default">
                <Button variant="primary">Send PO</Button>
                <Button>Open order</Button>
                <Button variant="ghost">Cancel</Button>
              </Sample>
              <Sample label="with icon · md 32px">
                <Button variant="primary" icon="call">
                  Call NETS
                </Button>
                <Button icon="print">Print</Button>
              </Sample>
              <Sample label="sm 24px — dense bands">
                <Button variant="primary" size="sm" icon="add">
                  Add
                </Button>
                <Button size="sm">Edit</Button>
              </Sample>
              <Sample label="hover (forced)">
                <span className={FORCED_HOVER_PRIMARY}>
                  <Button variant="primary">Send PO</Button>
                </span>
                <span className={FORCED_HOVER_NEUTRAL}>
                  <Button>Open order</Button>
                </span>
              </Sample>
              <Sample label="focus (forced)">
                <span className={FORCED_FOCUS_BUTTON}>
                  <Button variant="primary">Send PO</Button>
                </span>
              </Sample>
              <Sample label="disabled">
                <Button variant="primary" disabled>
                  Send PO
                </Button>
                <Button disabled>Open order</Button>
              </Sample>
              <Sample label="loading">
                <Button variant="primary" loading>
                  Sending
                </Button>
                <Button loading>Loading</Button>
              </Sample>
              <Sample label="long text — the button never wraps, the caller constrains it">
                <div className="w-64 overflow-hidden">
                  <Button variant="primary">{LONG}</Button>
                </div>
              </Sample>
            </div>
          </Card>
        </Section>

        <Section id="fields" title="Input · Textarea · SearchInput — §6" note="One skin, three shapes.">
          <Grid>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="empty value — the placeholder is the only content">
                  <div className="w-full">
                    <Input id="ui-empty" label="Customer" placeholder="Search a customer" />
                  </div>
                </Sample>
                <Sample label="filled + hint (live — type in it)">
                  <div className="w-full">
                    <Input
                      id="ui-filled"
                      label="Sales order"
                      hint="The reference printed on the customer's copy"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </div>
                </Sample>
                <Sample label="focus (forced)">
                  <div className={`w-full ${FORCED_FOCUS_INPUT}`}>
                    <Input id="ui-focus" label="Sales order" defaultValue="SO-1256" />
                  </div>
                </Sample>
                <Sample label="error — the message replaces the hint">
                  <div className="w-full">
                    <Input
                      id="ui-error"
                      label="Phone"
                      required
                      defaultValue="01"
                      hint="Never shown while an error is"
                      error="Enter a Malaysian mobile number"
                    />
                  </div>
                </Sample>
                <Sample label="disabled">
                  <div className="w-full">
                    <Input id="ui-disabled" label="Sales order" defaultValue="SO-1256" disabled />
                  </div>
                </Sample>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="search — no label, no error, never required">
                  <div className="w-full">
                    <SearchInput id="ui-search" />
                  </div>
                </Sample>
                <Sample label="textarea — default">
                  <div className="w-full">
                    <Textarea id="ui-note" label="Note (optional)" placeholder="What happened" />
                  </div>
                </Sample>
                <Sample label="textarea — long value">
                  <div className="w-full">
                    <Textarea id="ui-note-long" label="Note (optional)" defaultValue={LONG} />
                  </div>
                </Sample>
                <Sample label="textarea — error">
                  <div className="w-full">
                    <Textarea id="ui-note-error" label="Reason" required error="A reason is required" />
                  </div>
                </Sample>
                <Sample label="textarea — disabled">
                  <div className="w-full">
                    <Textarea id="ui-note-disabled" label="Note (optional)" defaultValue="Locked" disabled />
                  </div>
                </Sample>
              </div>
            </Card>
          </Grid>
        </Section>

        <Section
          id="status"
          title="StatusPill · Badge — §3.4"
          note="A status is a pill or it is not a status. A badge counts things and has no tone at all."
        >
          <Grid>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="every tone — the tone is COMPUTED by the engine, never chosen by a page">
                  {TONES.map((tone) => (
                    <StatusPill key={tone} tone={tone}>
                      {tone}
                    </StatusPill>
                  ))}
                </Sample>
                <Sample label="with a status glyph">
                  <StatusPill tone="success" icon="ready">
                    Ready
                  </StatusPill>
                  <StatusPill tone="warning" icon="waiting">
                    Waiting
                  </StatusPill>
                  <StatusPill tone="danger" icon="late">
                    Late
                  </StatusPill>
                  <StatusPill tone="neutral" icon="on-hold">
                    On hold
                  </StatusPill>
                </Sample>
                <Sample label="long text — truncates inside its cell, never wraps the row">
                  <div className="w-48">
                    <StatusPill tone="warning" icon="waiting">
                      {LONG}
                    </StatusPill>
                  </div>
                </Sample>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="badge — a count">
                  <Badge>18</Badge>
                  <Badge>0</Badge>
                  <Badge>129</Badge>
                </Sample>
                <Sample label="badge — a plain tag">
                  <Badge>Sofa</Badge>
                  <Badge>Klang</Badge>
                </Sample>
                <Sample label="badge — long text">
                  <div className="w-48 truncate">
                    <Badge>{LONG}</Badge>
                  </div>
                </Sample>
              </div>
            </Card>
          </Grid>
        </Section>

        <Section id="surfaces" title="Card · Panel — §6" note="A Card holds. A Panel holds and says what it is.">
          <Grid>
            <Card>
              <div className="flex flex-col gap-2">
                <p className="text-strong text-kit-slate-12">Card — default</p>
                <p className="text-body text-kit-slate-11">{LONG}</p>
              </div>
            </Card>
            <Panel
              title="Panel — with a right slot"
              right={
                <Button size="sm" icon="open">
                  Open order
                </Button>
              }
            >
              <p className="text-body text-kit-slate-11">
                The header divider is the stronger `slate-6` step — a split inside one surface, not the
                surface's own edge.
              </p>
            </Panel>
            <Panel title="Panel — a title long enough to need truncating on a narrow column">
              <p className="text-body text-kit-slate-11">The title truncates; the panel never grows a row.</p>
            </Panel>
            <Panel title="Panel — empty body" padding="none">
              <EmptyState
                icon="goods"
                title="Nothing waiting on stock"
                detail="Every line on this order has arrived."
              />
            </Panel>
          </Grid>
        </Section>

        <Section
          id="states"
          title="UI states — §9"
          note="Empty · Loading · Error · No permission · Offline all render through the same two boxes. A state that needs a new component is a state nobody defined."
        >
          <Grid>
            <Card>
              <EmptyState
                icon="search"
                title="No orders match this filter"
                detail="Clear a filter to see the rest."
                action={<Button icon="close">Clear filters</Button>}
              />
            </Card>
            <Card>
              <EmptyState
                icon="late"
                title="This did not load"
                detail="The connection dropped before the list arrived."
                action={
                  <Button variant="primary" icon="refresh">
                    Try again
                  </Button>
                }
              />
            </Card>
            <Card>
              <EmptyState icon="lock" title="You cannot open this" detail="Ask a manager for access." />
            </Card>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="loading — skeleton (a region arriving)">
                  <div className="w-full">
                    <Loading variant="skeleton" />
                  </div>
                </Sample>
                <Sample label="loading — spinner (a control is busy)">
                  <span className="text-kit-slate-11">
                    <Loading size={14} />
                  </span>
                  <span className="text-kit-slate-11">
                    <Loading size={16} />
                  </span>
                  <span className="text-kit-slate-11">
                    <Loading size={18} />
                  </span>
                </Sample>
              </div>
            </Card>
          </Grid>
        </Section>

        {/* ─── 4 · The Radix half — behaviour, card D0.5b ──────────────────── */}
        <Section
          id="overlays"
          title="Modal · Drawer — §6"
          note="Radix supplies the focus trap, escape, scroll lock and returning focus to the trigger. Every visible value is the kit's. Both are CONTROLLED — a page that cannot close its own modal submits twice."
        >
          <Card>
            <div className="flex flex-col gap-8">
              <Sample label="open them — escape closes, so does the ✕, and focus comes back here">
                <Button variant="primary" onClick={() => setModalOpen(true)}>
                  Open a modal
                </Button>
                <Button onClick={() => setDrawerOpen(true)}>Open a drawer</Button>
              </Sample>
              <p className="text-meta text-kit-slate-11">
                A Modal interrupts to ask something. A Drawer opens a RECORD beside the list it came
                from — §8.2 says closing it gives the list back its filter and its scroll. What goes
                INSIDE a record is `DetailShell`, card D0.5c.
              </p>
            </div>
          </Card>

          <Modal
            open={modalOpen}
            onOpenChange={setModalOpen}
            title="Record the delay decision"
            description="One question, and only Operations answers it."
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>
                  Save
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <Select
                id="ui-modal-select"
                label="Logistics"
                placeholder="Pick a carrier"
                options={CARRIERS}
                value={carrier}
                onValueChange={setCarrier}
              />
              <Textarea id="ui-modal-note" label="Note (optional)" placeholder="What happened" />
            </div>
          </Modal>

          <Drawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            title="SO-1256 · Tan Wei Ming"
            footer={<Button icon="open">Open order</Button>}
          >
            <div className="flex flex-col gap-4">
              <p className="text-body text-kit-slate-11">
                The surface only. §1.4's ordered blocks — identity · current action · current issues ·
                progress · sections · activity — are `DetailShell`, card D0.5c.
              </p>
              <EmptyState
                icon="goods"
                title="Nothing waiting on stock"
                detail="Every line on this order has arrived."
              />
            </div>
          </Drawer>
        </Section>

        <Section
          id="pickers"
          title="Select · DropdownMenu · Popover · Tooltip — §6"
          note="Four floating surfaces, one recipe. A Select and a DropdownMenu take their rows as DATA, so no page can put a second line or a pill inside one."
        >
          <Grid>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="select — empty, so the placeholder is the only content">
                  <div className="w-full">
                    <Select
                      id="ui-select"
                      label="Logistics"
                      placeholder="Pick a carrier"
                      hint="The company that moves the goods"
                      options={CARRIERS}
                      value={carrier}
                      onValueChange={setCarrier}
                    />
                  </div>
                </Sample>
                <Sample label="select — error, and the message replaces the hint">
                  <div className="w-full">
                    <Select
                      id="ui-select-error"
                      label="Logistics"
                      required
                      hint="Never shown while an error is"
                      error="Pick a carrier"
                      options={CARRIERS}
                      onValueChange={() => {}}
                    />
                  </div>
                </Sample>
                <Sample label="select — disabled">
                  <div className="w-full">
                    <Select
                      id="ui-select-disabled"
                      label="Logistics"
                      value="nets"
                      disabled
                      options={CARRIERS}
                      onValueChange={() => {}}
                    />
                  </div>
                </Sample>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="⋮ menu — no colour, no red row; a destructive command is an ordinary word">
                  <DropdownMenu
                    label="Row actions"
                    trigger={<Button icon="overflow" aria-label="More" />}
                    items={[
                      { key: "print", label: "Print", icon: "print", onSelect: () => {} },
                      { key: "copy", label: "Copy reference", icon: "copy", onSelect: () => {} },
                      {
                        key: "cancel",
                        label: "Cancel order",
                        icon: "close",
                        separatorBefore: true,
                        onSelect: () => {},
                      },
                    ]}
                  />
                </Sample>
                <Sample label="popover — a Contextual Surface: it holds no permanent height">
                  <Popover label="Filters" trigger={<Button icon="filter">Filter</Button>}>
                    <div className="flex w-56 flex-col gap-2">
                      <Checkbox id="ui-f1" label="Owing" checked={picked} onCheckedChange={setPicked} />
                      <Checkbox id="ui-f2" label="Late" checked={false} onCheckedChange={() => {}} />
                    </div>
                  </Popover>
                </Sample>
                <Sample label="tooltip — opens on hover AND on focus, which title= never does">
                  <Tooltip content="already past that deadline">
                    <Button icon="late" aria-label="Late" />
                  </Tooltip>
                  <span className="text-meta text-kit-slate-11">hover or tab to it</span>
                </Sample>
              </div>
            </Card>
          </Grid>
        </Section>

        <Section
          id="tabs"
          title="Tabs — §8.2's stage picker"
          note="Exactly one is on, always. Clicking the one that is on does NOTHING, because there is no unfiltered view to clear back to — that is the rule, and Radix gives it for free."
        >
          <Card>
            <div className="flex flex-col gap-4">
              <Tabs label="Purchasing" tabs={MODULE_TABS} value={tab} onValueChange={setTab} />
              <p className="text-meta text-kit-slate-11">
                A count is a `Badge`, never a coloured pill — a badge that could be red would be a
                status wearing a different name. Tabs with nothing to count show no number at all.
              </p>
            </div>
          </Card>
        </Section>

        <Section
          id="checkbox-date"
          title="Checkbox · DatePicker — §6 · §2.4"
          note="A checkbox's third state is a different SHAPE, not a different colour. A date field speaks ISO and prints fmtDate() — it can never hand a date to the locale."
        >
          <Grid>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="checked · unchecked · some (a select-all over a partial pick)">
                  <Checkbox id="ui-cb1" label="Owing" checked={picked} onCheckedChange={setPicked} />
                  <Checkbox id="ui-cb2" label="Late" checked={false} onCheckedChange={() => {}} />
                  <Checkbox
                    id="ui-cb3"
                    label="Select all"
                    checked={some}
                    onCheckedChange={(next) => setSome(next)}
                  />
                </Sample>
                <Sample label="disabled">
                  <Checkbox id="ui-cb4" label="Cancelled" checked={false} disabled onCheckedChange={() => {}} />
                </Sample>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="a date — the canonical 19 Jul 26, Sun, from fmtDate()">
                  <div className="w-full">
                    <DatePicker id="ui-date" label="Delivery date" value={date} onChange={setDate} />
                  </div>
                </Sample>
                <Sample label="empty — the placeholder, and nothing else">
                  <div className="w-full">
                    <DatePicker id="ui-date-empty" label="Ready date" value={null} onChange={() => {}} />
                  </div>
                </Sample>
                <Sample label="error — the message replaces the hint">
                  <div className="w-full">
                    <DatePicker
                      id="ui-date-error"
                      label="Delivery date"
                      required
                      hint="Never shown while an error is"
                      error="Pick a date"
                      value={null}
                      onChange={() => {}}
                    />
                  </div>
                </Sample>
              </div>
            </Card>
          </Grid>
        </Section>

        <Section
          id="toast"
          title="Toast — §9's Success state"
          note="Rendered STATICALLY here: a real toast is on screen for four seconds, which no screenshot gate can photograph. It reuses the one sonner host App.tsx already mounts — a second host would stack two toasts in two corners."
        >
          <Card>
            <div className="flex flex-col gap-4">
              <Toast kind="success" message="Delivery order issued" />
              <Toast kind="warning" message="Two lines still have no PO" />
              <Toast kind="danger" message="That did not save — nothing changed" />
              <p className="text-meta text-kit-slate-11">
                Three kinds and no fourth. There is deliberately no "info" toast: a message with no
                consequence has not earned an interruption. The tone sits on the GLYPH, never on the
                whole surface.
              </p>
            </div>
          </Card>
        </Section>

        {/* ─── 5 · The shells — structure, card D0.5c ──────────────────────── */}
        <Section
          id="shells"
          title="PageShell · DataTable — §8.1 · §7"
          note="Extracted from the Orders page, not designed fresh. The list variant has NO kpi slot and there is no extra band — an eighth band is not forbidden by a sentence, it has nowhere to go."
        >
          <Card padding="none">
            <div className="h-96">
              <PageShell
                variant="list"
                title="Orders"
                toolbar={<Tabs label="Orders" tabs={ORDER_TABS} value={ordersTab} onValueChange={setOrdersTab} />}
                toolbarRight={<SearchInput id="ui-shell-search" />}
                chips={[{ label: "Region: KV", onClear: () => {} }]}
                footer={<span>2 of 55 orders</span>}
              >
                <DataTable
                  label="Orders"
                  rows={DEMO_ROWS}
                  columns={DEMO_COLUMNS}
                  rowId={(r) => r.id}
                  onRowOpen={() => setDrawerOpen(true)}
                  selection={{
                    selected: picked ? new Set(["1"]) : new Set(),
                    onToggleRow: () => setPicked((p) => !p),
                    onToggleAll: () => setPicked((p) => !p),
                    label: "Select all orders",
                  }}
                  empty="No orders match this filter"
                />
              </PageShell>
            </div>
          </Card>
          <p className="text-meta text-kit-slate-11">
            The table is `table-fixed` on percentage widths, so it is always exactly the container
            width and never scrolls sideways; rows are 40px fixed and each cell clips its own
            overflow. Clicking a row opens its record — the drawer above.
          </p>
        </Section>

        <Section
          id="detail-shell"
          title="DetailShell — §1.4 · the information model's L4"
          note="Six ordered slots and no state prop. Working · Blocked · Waiting · Completed are produced by what the slots are given — a component that cannot be told a state cannot print one."
        >
          <Grid>
            <Card padding="none">
              <div className="h-96 overflow-hidden">
                <DetailShell
                  identity={DEMO_IDENTITY}
                  currentAction={{ answer: "Call NETS — confirm delivery date", context: "Due today · Jess" }}
                  currentIssues={[]}
                  progress={DEMO_PROGRESS}
                  sections={DEMO_SECTIONS}
                />
              </div>
            </Card>
            <Card padding="none">
              <div className="h-96 overflow-hidden">
                <DetailShell
                  identity={DEMO_IDENTITY}
                  currentAction={{ answer: "Collect RM 2,000 from Tan Wei Ming" }}
                  currentIssues={[
                    { id: "a", track: "goods", text: "2 lines have no PO" },
                    { id: "b", track: "money", text: "RM 2,000 is holding the delivery", holding: true },
                  ]}
                  progress={DEMO_PROGRESS}
                  sections={DEMO_SECTIONS}
                />
              </div>
            </Card>
          </Grid>
          <p className="text-meta text-kit-slate-11">
            LEFT is a calm order: Current Issues renders NOTHING — no "✓ None", no empty card, no
            reassuring tick. RIGHT is the same order blocked. Nothing else moved, and neither card
            was told which one it is.
          </p>
        </Section>

        <Section
          id="layers"
          title="Z-index — §4.4"
          note="Fifteen levels are in use across the portal today. Five survive, and they are reachable only through components — one file in the kit may name one."
        >
          <Card>
            <div className="flex flex-col gap-2">
              {Z_LADDER.map((l) => (
                <div key={l.z} className="flex items-center gap-4">
                  <span className="w-12 shrink-0 font-mono text-meta text-kit-slate-12 tabular-nums">
                    z-{l.z}
                  </span>
                  <span className="text-body text-kit-slate-12">{l.layer}</span>
                  <span className="text-meta text-kit-slate-11">
                    {l.owner} · {l.card}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      </div>
    </main>
  );
}
