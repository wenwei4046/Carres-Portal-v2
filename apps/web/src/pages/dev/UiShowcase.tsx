/**
 * `/ui` — THE live showcase (UI-KIT's third body, card D0.5a).
 *
 * `docs/UI-KIT.md` explains what the kit means; `lib/design-standard.ts`
 * records it; **this page IS it.** It imports the real components and renders
 * the real tokens, so it structurally cannot describe something the code does
 * not do — which is the one failure the first two bodies cannot rule out.
 *
 * It carries TWO jobs:
 *   1. §9 UI STATES. Every component in every state, including the ugly ones —
 *      default · hover · focus · disabled · loading · error · long text ·
 *      empty value. §13.4 screenshots this page in CI, and a screenshot that
 *      only covers the happy path proves nothing.
 *   2. The token reference — type, weight, colour, spacing, radius, icons —
 *      rendered FROM the same records the components read.
 *
 * **It had a third until 2026-07-28**: the PENDING REGISTER, where Q1 spacing ·
 * Q3 weight · Q4 icon stroke were rendered side by side for Jess to choose.
 * She froze all three and the comparison came out — a decision surface that
 * outlives its decision is a page telling a new hire a settled thing is still
 * open. The answers live in `docs/UI-KIT.md`; what shows here is the result.
 *
 * Two constants below (`FORCED_*`) paint a hover/focus state that a static
 * screenshot could not otherwise capture. They mirror the components' own
 * declarations, and `UiShowcase.test.tsx` fails if the two ever drift.
 */
import { useState, type ReactNode } from "react";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import Card from "@/components/kit/Card";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import Drawer from "@/components/kit/Drawer";
import DropdownMenu from "@/components/kit/DropdownMenu";
import EmptyState from "@/components/kit/EmptyState";
import Icon, { ICON_NAMES } from "@/components/kit/Icon";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Modal from "@/components/kit/Modal";
import Panel from "@/components/kit/Panel";
import Popover from "@/components/kit/Popover";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import Tabs, { TabPanel } from "@/components/kit/Tabs";
import Textarea from "@/components/kit/Textarea";
import { toast } from "@/components/kit/Toast";
import Tooltip from "@/components/kit/Tooltip";
import { ICON_STROKE, RADII, SPACING_SCALE, TONES, TYPE_TOKENS, WEIGHTS } from "@/components/kit/tokens";

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

export default function UiShowcase() {
  const [text, setText] = useState("SO-1256");
  /* D0.5b's boxes are BEHAVIOUR, so the showcase has to drive them like a page
   * would — open state, a chosen value, a picked date. Nothing here is a
   * component's own state; every one of them reports to its caller. */
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [supplier, setSupplier] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState("to-order");
  const [picked, setPicked] = useState<string | null>("2026-07-27");
  const [rowChecked, setRowChecked] = useState(false);

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

        {/* ─── 1 · Tokens ─────────────────────────────────────────────────── */}
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
          id="weight"
          title="Weight — §2.2"
          note="Three weights. 700 was deleted into 600 (Jess, 2026-07-28) — the two were doing one job."
        >
          <Card>
            <div className="flex flex-col gap-4">
              {WEIGHTS.map((w) => (
                <div key={w.weight} className="flex flex-wrap items-baseline gap-4">
                  <span className="w-40 shrink-0 font-mono text-meta text-kit-slate-11">{w.className}</span>
                  <span className={`text-strong ${w.className} text-kit-slate-12`}>RM 56,859 · Delivery this week</span>
                  <span className="text-meta text-kit-slate-11 tabular-nums">{w.weight}</span>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <Section
          id="spacing"
          title="Spacing — §4.1"
          note="Eight steps, frozen 2026-07-28. Dead under the scale: 10 · 14 · 18 · 20 · 22 · 33 and every arbitrary p-[Npx]."
        >
          <Card>
            <div className="flex flex-col gap-4">
              {SPACING_SCALE.map((s) => (
                <div key={s.px} className="flex items-center gap-4">
                  <span className="w-16 shrink-0 font-mono text-meta text-kit-slate-12 tabular-nums">{s.px}px</span>
                  <span className="w-16 shrink-0 font-mono text-meta text-kit-slate-11">-{s.suffix}</span>
                  {/* The bar's width IS the token — a value, not a style choice,
                      which is why it is the one inline width on this page. */}
                  <span className="h-4 bg-kit-blue-9" style={{ width: `${s.px}px` }} />
                  <span className="text-meta text-kit-slate-11">{s.use}</span>
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
          note={`One meaning, one glyph. The name is the MEANING, never a Lucide import — a fifth name for \`edit\` does not compile. Stroke is frozen at ${ICON_STROKE} and there is no prop to change it.`}
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

        {/* ─── 4 · The behaviour boxes — §6, card D0.5b ────────────────────── */}
        <Section
          id="overlays"
          title="Modal · Drawer — §6"
          note="Radix owns the behaviour (focus trap, Escape, scroll lock, the portal); Carres owns the surface. A modal INTERRUPTS, a drawer ACCOMPANIES — which is why they are two components and not one prop."
        >
          <Card>
            <div className="flex flex-col gap-8">
              <Sample label="open them — both are driven by the caller's state, never their own">
                <Button variant="primary" onClick={() => setModalOpen(true)}>
                  Open modal
                </Button>
                <Button onClick={() => setDrawerOpen(true)}>Open drawer</Button>
              </Sample>
              <p className="text-meta text-kit-slate-11">
                Both refuse to exist without a title: a dialog with no accessible name is announced as
                nothing. There is no `size=&quot;full&quot;` (that is a page) and no way to make one
                undismissable (that is a trap).
              </p>
            </div>
          </Card>
          <Modal
            open={modalOpen}
            onOpenChange={setModalOpen}
            title="Record the delay decision"
            description="The supplier named a later date. Answer one question."
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
                label="Supplier"
                placeholder="Pick a supplier"
                value={supplier}
                onValueChange={setSupplier}
                options={[
                  { value: "nets", label: "NETS" },
                  { value: "ohana", label: "Ohana" },
                  { value: "nice-future", label: "Nice Future", disabled: true },
                ]}
              />
              <Textarea id="ui-modal-note" label="Note (optional)" placeholder="What happened" />
            </div>
          </Modal>
          <Drawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            title="SO-1256 · Tan Wei Ming"
            footer={<Button onClick={() => setDrawerOpen(false)}>Close</Button>}
          >
            <p className="text-body text-kit-slate-11">
              A drawer accompanies the record — the list stays behind it. The order drawer itself is not
              ported here; that is D0.5c&apos;s DetailShell.
            </p>
          </Drawer>
        </Section>

        <Section
          id="pickers"
          title="Select · DatePicker · Checkbox — §6"
          note="Three controls that wear Input's skin, so a form row lines up whatever the field happens to be."
        >
          <Grid>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="select — empty value shows the placeholder">
                  <div className="w-full">
                    <Select
                      id="ui-select"
                      label="Supplier"
                      hint="Options are DATA — a caller cannot put a button in the list"
                      placeholder="Pick a supplier"
                      value={supplier}
                      onValueChange={setSupplier}
                      options={[
                        { value: "nets", label: "NETS" },
                        { value: "ohana", label: "Ohana" },
                        { value: "nice-future", label: "Nice Future (disabled)", disabled: true },
                      ]}
                    />
                  </div>
                </Sample>
                <Sample label="select — error">
                  <div className="w-full">
                    <Select id="ui-select-error" label="Supplier" error="Pick a supplier" options={[]} />
                  </div>
                </Sample>
                <Sample label="select — disabled">
                  <div className="w-full">
                    <Select id="ui-select-disabled" label="Supplier" disabled options={[]} />
                  </div>
                </Sample>
              </div>
            </Card>
            <Card>
              <div className="flex flex-col gap-8">
                <Sample label="date — the trigger prints fmtDate(), never an ISO string">
                  <div className="w-full">
                    <DatePicker id="ui-date" label="Delivery date" value={picked} onChange={setPicked} />
                  </div>
                </Sample>
                <Sample label="date — empty value">
                  <div className="w-full">
                    <DatePicker id="ui-date-empty" label="Delivery date" value={null} onChange={() => {}} />
                  </div>
                </Sample>
                <Sample label="checkbox — off · on · indeterminate · disabled">
                  <Checkbox checked={rowChecked} onCheckedChange={setRowChecked} aria-label="Select row" />
                  <Checkbox checked onCheckedChange={() => {}} aria-label="Checked" />
                  <Checkbox checked="indeterminate" onCheckedChange={() => {}} aria-label="Some rows" />
                  <Checkbox checked={false} onCheckedChange={() => {}} disabled aria-label="Disabled" />
                </Sample>
              </div>
            </Card>
          </Grid>
        </Section>

        <Section
          id="disclosure"
          title="Tabs · DropdownMenu · Popover · Tooltip — §6"
          note="A tab bar is a STAGE picker (§8.2): one is always on, and re-clicking it does nothing. A popover holds controls; a tooltip holds one line and cannot be clicked into."
        >
          <Card>
            <div className="flex flex-col gap-8">
              <Tabs
                label="Purchasing"
                value={tab}
                onValueChange={setTab}
                tabs={[
                  { value: "to-order", label: "To order", count: 3 },
                  { value: "receiving", label: "Receiving", count: 0 },
                  { value: "claims", label: "Claims" },
                ]}
              >
                <TabPanel value="to-order">
                  <p className="text-body text-kit-slate-11">The active value is the caller&apos;s state, because on a real page it lives in the URL.</p>
                </TabPanel>
                <TabPanel value="receiving">
                  <p className="text-body text-kit-slate-11">Receiving panel.</p>
                </TabPanel>
                <TabPanel value="claims">
                  <p className="text-body text-kit-slate-11">Claims panel.</p>
                </TabPanel>
              </Tabs>
              <Sample label="menu · popover · tooltip">
                <DropdownMenu
                  label="More"
                  trigger={<Button icon="overflow" aria-label="More" />}
                  items={[
                    { label: "Print", icon: "print", onSelect: () => {} },
                    { label: "Copy", icon: "copy", onSelect: () => {} },
                    { label: "Cancel order", icon: "close", tone: "danger", separated: true, onSelect: () => {} },
                  ]}
                />
                <Popover label="Filters" trigger={<Button icon="filter">Filters</Button>}>
                  <div className="flex flex-col gap-2">
                    <p className="text-label text-kit-slate-11">A contextual surface holds no permanent height.</p>
                    <SearchInput id="ui-popover-search" placeholder="Search a filter" />
                  </div>
                </Popover>
                <Tooltip content="Collect RM 2,000 from Tan Wei Ming">
                  <Button>Hover me</Button>
                </Tooltip>
              </Sample>
              <Sample label="toast — §9's Success, and the one state that never becomes a block">
                <Button onClick={() => toast.success("Delivery order issued")}>Show a toast</Button>
                <Button variant="ghost" onClick={() => toast.error("That did not save")}>
                  Show an error
                </Button>
              </Sample>
            </div>
          </Card>
        </Section>
      </div>
    </main>
  );
}
