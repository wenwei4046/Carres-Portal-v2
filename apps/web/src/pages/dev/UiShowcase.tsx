/**
 * `/ui` — THE live showcase (UI-KIT's third body, card D0.5a).
 *
 * `docs/UI-KIT.md` explains what the kit means; `lib/design-standard.ts`
 * records it; **this page IS it.** It imports the real components and renders
 * the real tokens, so it structurally cannot describe something the code does
 * not do — which is the one failure the first two bodies cannot rule out.
 *
 * It carries THREE jobs:
 *   1. The PENDING REGISTER. Q1 spacing · Q3 weight · Q4 icon stroke are
 *      rendered side by side. **Jess freezes them here** — this page does not
 *      prefer one, and no component depends on the answer.
 *   2. §9 UI STATES. Every component in every state, including the ugly ones —
 *      default · hover · focus · disabled · loading · error · long text ·
 *      empty value. §13.4 screenshots this page in CI, and a screenshot that
 *      only covers the happy path proves nothing.
 *   3. The token reference — type, colour, radius, icons — rendered FROM the
 *      same records the components read.
 *
 * Two constants below (`FORCED_*`) paint a hover/focus state that a static
 * screenshot could not otherwise capture. They mirror the components' own
 * declarations, and `UiShowcase.test.tsx` fails if the two ever drift.
 */
import { useState, type ReactNode } from "react";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import Card from "@/components/kit/Card";
import EmptyState from "@/components/kit/EmptyState";
import Icon, { ICON_NAMES } from "@/components/kit/Icon";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Panel from "@/components/kit/Panel";
import SearchInput from "@/components/kit/SearchInput";
import StatusPill from "@/components/kit/StatusPill";
import Textarea from "@/components/kit/Textarea";
import {
  ICON_STROKE_CANDIDATES,
  RADII,
  SPACING_CANDIDATES,
  TONES,
  TYPE_TOKENS,
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

export default function UiShowcase() {
  const [text, setText] = useState("SO-1256");

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

        {/* ─── 1 · PENDING — the reason this page shipped in D0.5a ────────── */}
        <Section
          id="pending"
          title="Pending decisions"
          note="Three values are NOT frozen. Nothing enforces them and no component depends on the answer. Jess decides here."
        >
          <Panel title="Q1 · Spacing scale">
            <div className="flex flex-col gap-8">
              {/* Candidate A uses 2 and 6; candidate B has neither. The same row
                  is drawn twice so the difference is a row, not a table. */}
              <Sample
                label={`${SPACING_CANDIDATES.A.label} — ${SPACING_CANDIDATES.A.migrationSites} sites to migrate`}
              >
                <div className="w-full rounded-card border border-kit-slate-5 bg-white px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Icon name="order" size={14} />
                    <span className="text-body font-mono">SO-1256</span>
                    <span className="text-body text-kit-slate-11">Tan Wei Ming</span>
                    <StatusPill tone="warning" icon="waiting">
                      Waiting
                    </StatusPill>
                    <span className="text-meta text-kit-slate-11">27 Jul 26, Sun</span>
                  </div>
                </div>
              </Sample>
              <Sample
                label={`${SPACING_CANDIDATES.B.label} — ${SPACING_CANDIDATES.B.migrationSites} sites to migrate`}
              >
                <div className="w-full rounded-card border border-kit-slate-5 bg-white px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Icon name="order" size={14} />
                    <span className="text-body font-mono">SO-1256</span>
                    <span className="text-body text-kit-slate-11">Tan Wei Ming</span>
                    <StatusPill tone="warning" icon="waiting">
                      Waiting
                    </StatusPill>
                    <span className="text-meta text-kit-slate-11">27 Jul 26, Sun</span>
                  </div>
                </div>
              </Sample>
              <p className="text-meta text-kit-slate-11">
                Candidate B is the stricter 4pt grid and drops 2 and 6, so dense rows loosen and fewer
                fit on a screen. Candidate A keeps them and costs a third of the migration.
              </p>
            </div>
          </Panel>

          <Panel title="Q3 · font-bold (700)">
            <div className="flex flex-col gap-4">
              <Sample label="600 semibold — 854 uses today">
                <span className="text-title font-semibold text-kit-slate-12">RM 56,859</span>
                <span className="text-strong font-semibold text-kit-slate-12">Delivery this week</span>
              </Sample>
              <Sample label="700 bold — 158 uses today, proposed for deletion">
                <span className="text-title font-bold text-kit-slate-12">RM 56,859</span>
                <span className="text-strong font-bold text-kit-slate-12">Delivery this week</span>
              </Sample>
              <p className="text-meta text-kit-slate-11">
                If the two read the same at these sizes, 700 is doing no work and folds into 600.
              </p>
            </div>
          </Panel>

          <Panel title="Q4 · Icon stroke width">
            <div className="flex flex-col gap-4">
              {ICON_STROKE_CANDIDATES.map((stroke) => (
                <Sample key={stroke} label={`stroke ${stroke}${stroke === 2 ? " — Lucide default" : ""}`}>
                  {([14, 16, 18] as const).map((size) => (
                    <span key={size} className="flex items-center gap-2 text-kit-slate-11">
                      <Icon name="delivery" size={size} strokeWidth={stroke} />
                      <Icon name="money" size={size} strokeWidth={stroke} />
                      <Icon name="goods" size={size} strokeWidth={stroke} />
                      <span className="text-meta">{size}px</span>
                    </span>
                  ))}
                </Sample>
              ))}
              <p className="text-meta text-kit-slate-11">
                The 14px row is the one that decides it — that is the size inside a table row and a pill.
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
      </div>
    </main>
  );
}
