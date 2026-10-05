/**
 * CompactModuleCard — the owner-confirmed compact module card (UI MASTER §4.3:
 * confirmed 2026-10-03, shared header and module rules 2026-10-04).
 *
 * ONE shared customer header for every module: name · order · phone, a ▾/▴ in
 * the customer cell's lower right that opens the sales facts (Order date ·
 * Sales Location · Salesperson, label above value), the address with its own
 * toggle, the target date and Open / Close. Below it the module tabs; each
 * module passes its OWN summary facts (label above value, left aligned; only
 * as many cells as it has facts), its editors and its items. Communication,
 * items and Timeline start closed. Info opens sales facts and address; every
 * other module starts with them closed.
 *
 * The card owns arrangement and interaction only. It writes no record, never
 * marks a message sent, keeps saved message templates in the browser and
 * uploads no file. Business gates stay with the owning module.
 *
 * Palette, font family, radii and the drawn glyphs are the reference's own and
 * await the owner's token decision — see `compact-card.module.css`.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import s from "./compact-card.module.css";

/** Class map for module-supplied editor and item content inside the card. */
export const compactCardStyles = s;

/* ---------- the reference's drawn glyphs (pending the owner's token decision) ---------- */
const GLYPH = {
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72l.69 2.79a2 2 0 0 1-.45 2.11L8.09 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45l2.79.69A2 2 0 0 1 22 16.92z" />,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  calendar: <><path d="M8 2v4M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h2M14 6h2M8 10h2M14 10h2M8 14h2M14 14h2" /></>,
  access: <path d="M3 20h6v-6h6V8h6M3 4h18" />,
  message: <><path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0Z" /><path d="M7 10h10M7 14h6" /></>,
  box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></>,
  addressPin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  history: <><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
  clip: <path d="m8 12 7-7a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L14 2M6 16l10-10" />,
};
function Glyph({ name }: { name: keyof typeof GLYPH }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{GLYPH[name]}</svg>;
}

/* ---------- words: the owner-confirmed reference copy ---------- */
export const CARD_WORDS = {
  orderDetails: "Order details",
  orderDate: "SO Doc Date",
  proceedDate: "Proceed date",
  salesLocation: "Sales Location",
  salesperson: "Salesperson",
  address: "Delivery address",
  modules: "Order modules",
  items: "Items",
  communication: "Communication",
  timeline: "Timeline",
  showTimeline: "Show timeline",
  hideTimeline: "Hide timeline",
  closeCommunication: "Close communication",
  closeTimeline: "Close timeline",
  channel: "Communication channel",
  whatsapp: "WhatsApp",
  email: "Email",
  to: "To",
  subject: "Subject",
  subjectPlaceholder: "Enter email subject",
  phonePlaceholder: "Choose contact or enter phone (+country code)",
  emailPlaceholder: "Enter email address",
  message: "Message",
  messagePlaceholder: "Draft a message",
  messageOptions: "Message options",
  findTemplate: "Find template…",
  saveAsTemplate: "Save as template…",
  manageTemplates: "Manage templates…",
  findTemplateTitle: "Find template",
  searchTemplates: "Search templates",
  messageTemplate: "Message template",
  chooseTemplate: "Choose template",
  saveTemplate: "Save template",
  closeSaveTemplate: "Close save template",
  name: "Name",
  cancel: "Cancel",
  save: "Save",
  close: "Close",
  delete: "Delete",
  savedTemplates: "Saved templates",
  noSavedTemplates: "No saved templates yet.",
  enterName: "Enter a template name.",
  writeFirst: "Write a message first.",
  nameUsed: "This name is already used. Choose another name.",
  couldNotSave: "Could not save in this browser.",
  templateSaved: "Template saved in this browser.",
  replaceDraft: "Replace the current draft with this template?",
  attachEvidence: "Attach evidence",
  evidenceNone: "Evidence · none attached",
  evidenceCount: (n: number) => `Evidence · ${n} attached (preview only)`,
  remove: (name: string) => `Remove ${name}`,
  copyMessage: "Copy message",
  openWhatsApp: "Open WhatsApp",
  openEmail: "Open email",
  copied: "Copied. Contact result is unchanged.",
  copyFallback: "Select the message and copy it.",
  recordedBy: (name: string) => `Recorded by ${name}`,
  recordedAt: (when: string) => `Recorded ${when}`,
  timeUnavailable: "Time unavailable",
  exactTimeUnavailable: "Exact time unavailable",
} as const;

/* ---------- time: full instant kept, shown without a zone suffix ---------- */
export const CARD_TIME_ZONE = "Asia/Kuala_Lumpur";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/**
 * `30 Sep · 4:08 PM` on screen; `30 Sep 2026, 4:08:32 PM` in the title; the ISO
 * instant stays in `dateTime`. Built from numeric parts with fixed month names,
 * because browsers disagree on short months (`Sep` vs `Sept`).
 */
export function formatCardTime(iso: string, timeZone = CARD_TIME_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  const day = `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]}`;
  const period = String(parts.dayPeriod).toUpperCase();
  return { short: `${day} · ${parts.hour}:${parts.minute} ${period}`, full: `${day} ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} ${period}` };
}

/* ---------- draft links: no API, never a send ---------- */
export type CardChannel = "whatsapp" | "email";
/** The draft address for a recipient, or "" when the recipient cannot be used yet. */
export function draftLink(channel: CardChannel, recipient: string, body: string, subject = "", knownPhones: Record<string, string> = {}): string {
  let r = recipient.trim();
  if (channel === "email") {
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(r)) return "";
    return `mailto:${encodeURIComponent(r)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  if (knownPhones[r]) r = knownPhones[r];
  if (!/^\+?[\d\s()-]+$/.test(r)) return "";
  let n = r.replace(/\D/g, "");
  if (n.startsWith("0")) n = `60${n.slice(1)}`;
  if (n.length < 8 || n.length > 15) return "";
  return `https://wa.me/${n}?text=${encodeURIComponent(body)}`;
}

/* ---------- saved message templates: this browser only ---------- */
export interface SavedTemplate { id: string; name: string; body: string; audience: string }
export interface TemplateStore { load(): SavedTemplate[]; save(next: SavedTemplate[]): boolean }
export function browserTemplateStore(key = "carres-preview-message-templates"): TemplateStore {
  return {
    load() { try { return JSON.parse(localStorage.getItem(key) || "[]") as SavedTemplate[]; } catch { return []; } },
    save(next) { try { localStorage.setItem(key, JSON.stringify(next)); return true; } catch { return false; } },
  };
}

/* ---------- props ---------- */
export interface CardFact {
  key: string;
  label: string;
  value: string;
  /** Optional second line under the value, e.g. Stock `Ready`, Customer `Date confirmed`. Omit it when there is nothing to say. */
  status?: string;
  /** Shows the ▾ at the right of the title row: the fact opens an inline editor. */
  editable?: boolean;
  /** Inline editor content. Call `close` only after a successful save, so a failure keeps the input. */
  editor?: (close: () => void) => ReactNode;
  /** Opening this fact shows the module's items instead of an editor (Stock). */
  opensItems?: boolean;
}
export interface CardModule {
  key: string;
  label: string;
  disabled?: boolean;
  /** The module's own summary facts — as many cells as it has facts. */
  summary?: CardFact[];
  items?: ReactNode;
  /** Source-owned facts and document lineage, separate from goods/services. */
  details?: ReactNode;
  /** Owning object vocabulary; Sales Order keeps its existing default. */
  detailsLabel?: string;
  /** Each module names its own recipient; null disables communication. */
  communication?: CardCommunication | null;
  /** Info opens sales facts and address on selection; other modules leave them closed. */
  opensHeaderDetails?: boolean;
}
export interface CardRecipient { value: string; label: string; phone?: string; whatsappUrl?: string }
export interface CardTemplate { key: string; label: string; body: string }
export interface CardTimelineEvent {
  id: string;
  actorName: string;
  actorInitial: string;
  summary: string;
  /** The recorded instant (ISO 8601). Shown as day and time; never invented. */
  at?: string;
  /** When the source only records a date: `YYYY-MM-DD` plus its label. */
  date?: string;
  dateLabel?: string;
  result?: string;
}
export interface CardCommunication {
  recipients: CardRecipient[];
  templates: CardTemplate[];
  store?: TemplateStore;
  namePlaceholder?: string;
}
export interface CompactModuleCardProps {
  name: string;
  reference: string;
  /** Exceptional document state only; normal records need no badge. */
  referenceStatus?: string;
  /** Optional source-owned read-only document. Mounted only after the number is opened. */
  document?: { label: string; preview: (onClose: () => void) => ReactNode };
  phone?: string;
  sales?: { orderDate: string; proceedDate?: string; salesLocation: string; salesperson: string };
  address?: { area: string; full: string; hideArea?: boolean; facts?: { kind: "building" | "access"; label: string; value: string }[] };
  target?: { date: string; badge?: string; label?: string; labelLines?: string[] };
  openLabel?: string;
  onOpen?: () => void;
  closeLabel?: string;
  onClose?: () => void;
  modules: CardModule[];
  /** Domain label for accessibility; customer orders keep their default. */
  modulesLabel?: string;
  initialModule: string;
  communication?: CardCommunication;
  timeline?: CardTimelineEvent[];
  timelineStatus?: string;
  timeZone?: string;
  /** For /ui and tests only; operators always start with these closed. */
  initiallyOpen?: { communication?: boolean; timeline?: boolean; items?: boolean };
}

export default function CompactModuleCard(p: CompactModuleCardProps) {
  const first = p.modules.find((m) => m.key === p.initialModule) ?? p.modules[0];
  const [documentOpen, setDocumentOpen] = useState(false);
  const documentEntry = useRef<HTMLButtonElement>(null);
  function closeDocument() {
    setDocumentOpen(false);
    selectModule(first);
    documentEntry.current?.focus();
  }
  const [moduleKey, setModuleKey] = useState(first.key);
  const [sales, setSales] = useState(!!first.opensHeaderDetails);
  const [address, setAddress] = useState(!!first.opensHeaderDetails);
  const [details, setDetails] = useState(false);
  const [items, setItems] = useState(!!p.initiallyOpen?.items);
  const [comm, setComm] = useState(!!p.initiallyOpen?.communication);
  const [timeline, setTimeline] = useState(!!p.initiallyOpen?.timeline);
  const [editing, setEditing] = useState<string | null>(null);
  const [marked, setMarked] = useState<string | null>(null);
  const ids = useId();
  const mod = p.modules.find((m) => m.key === moduleKey) ?? first;

  function selectModule(m: CardModule) {
    setModuleKey(m.key);
    setItems(false);
    setDetails(false);
    setEditing(null);
    setMarked(null);
    setSales(!!m.opensHeaderDetails);
    setAddress(!!m.opensHeaderDetails);
  }
  function openFact(f: CardFact) {
    const already = editing === f.key;
    setEditing(null);
    setMarked(null);
    if (already) return;
    setMarked(f.key);
    if (f.opensItems) { setItems(true); return; }
    if (f.editor) setEditing(f.key);
  }
  const close = () => { setEditing(null); setMarked(null); };
  const communication = mod.communication === undefined ? p.communication : mod.communication;
  const summary = mod.summary ?? [];
  const editingFact = summary.find((f) => f.key === editing);

  return (
    <div className={s.cq}>
      <section className={s.panel}>
        <header className={s.header} data-layout={!p.address && !p.target ? "identity" : p.address?.hideArea ? "no-area" : undefined}>
          <div className={s.identity}>
            <div className={s.identityTitle}><strong>{p.name}</strong></div>
            <small className={s.contactLine}><>{p.document ? <button ref={documentEntry} type="button" className={s.documentNumber} title={p.document.label} aria-label={p.document.label} aria-expanded={documentOpen} aria-controls={`${ids}-document`} onClick={() => setDocumentOpen((v) => !v)}>{p.reference}</button> : <span>{p.reference}</span>}</>{p.phone ? <span className={s.phonePair}><Glyph name="phone" />{p.phone}</span> : null}</small>
            {p.referenceStatus ? <small className={s.referenceStatus}>{p.referenceStatus}</small> : null}
            {p.sales ? (
              <button type="button" className={s.salesToggle} title={CARD_WORDS.orderDetails} aria-label={CARD_WORDS.orderDetails} aria-controls={`${ids}-sales`} aria-expanded={sales} onClick={() => { if (p.address?.hideArea) setAddress(!sales); setSales(v => !v); }}>
                <span className={s.chevron}>{sales ? "▴" : "▾"}</span>
              </button>
            ) : null}
          </div>
          <div className={s.addressBox} hidden={p.address?.hideArea}>
            {p.address ? (
              <button type="button" className={s.addressButton} aria-label={CARD_WORDS.address} title={p.address.full} aria-expanded={address} onClick={() => setAddress((v) => !v)}>
                <Glyph name="pin" /><span>{p.address.area}</span><span className={s.chevron} aria-hidden="true">{address ? "▴" : "▾"}</span>
              </button>
            ) : null}
          </div>
          <div className={s.target}>
            {p.target ? <><span className={s.targetLabel} title={p.target.label}>{p.target.labelLines?.map(line => <span key={line}>{line}</span>)}</span><b><Glyph name="calendar" />{p.target.date}{p.target.label ? p.target.badge ? <small title="Calendar days from Proceed date to customer’s original requested date">{p.target.badge}</small> : null : null}</b>{!p.target.label && p.target.badge ? <small className={s.badge}>{p.target.badge}</small> : null}</> : null}
          </div>
          <div className={s.actions}>
            <button type="button" aria-label={p.openLabel ?? "Open order"} title={p.openLabel ?? "Open order"} onClick={p.onOpen}>↗</button>
            <button type="button" aria-label={p.closeLabel ?? "Close panel"} title={p.closeLabel ?? "Close panel"} onClick={p.onClose}>×</button>
          </div>
        </header>
        {p.address && address ? (
          <div className={s.addressDetail}>
            <div className={s.fullAddress}><Glyph name="addressPin" /><span>{p.address.full}</span></div>
            {p.address.facts?.length ? (
              <div className={s.locationFacts}>
                {(["building", "access"] as const).flatMap(kind => { const group = p.address!.facts!.filter(f => f.kind === kind); return group.length ? [{ kind, label: group.map(f => f.label).join(" · "), value: group.map(f => f.value).join(" · ") }] : []; }).map((f) => (
                  <div key={f.label} className={s.factBox}><div aria-label={f.label}><Glyph name={f.kind} /></div><strong>{f.value}</strong></div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {p.sales && sales ? (
          <div id={`${ids}-sales`} className={`${s.salesGrid} ${p.sales.proceedDate !== undefined ? s.salesGridFour : ""}`}>
            <div className={s.salesFact}><span className={s.salesLabel}>{CARD_WORDS.orderDate}</span><strong>{p.sales.orderDate}</strong></div>
            {p.sales.proceedDate !== undefined ? <div className={s.salesFact}><span className={s.salesLabel}>{CARD_WORDS.proceedDate}</span><strong>{p.sales.proceedDate}</strong></div> : null}
            <div className={s.salesFact}><span className={s.salesLabel}>{CARD_WORDS.salesLocation}</span><strong>{p.sales.salesLocation}</strong></div>
            <div className={s.salesFact}><span className={s.salesLabel}>{CARD_WORDS.salesperson}</span><strong>{p.sales.salesperson}</strong></div>
          </div>
        ) : null}
        <nav className={s.moduleNav} aria-label={p.modulesLabel ?? CARD_WORDS.modules}>
          {p.modules.map((m) => (
            <button key={m.key} type="button" disabled={m.disabled} className={m.key === mod.key ? s.selected : undefined} aria-current={m.key === mod.key ? "page" : undefined} onClick={() => selectModule(m)}>{m.label}</button>
          ))}
          <span className={s.navSpacer} />
          {communication ? (
            <button type="button" className={`${s.toggle} ${s.toggleFirst}`} aria-label={CARD_WORDS.communication} title={CARD_WORDS.communication} aria-controls={`${ids}-comm`} aria-expanded={comm} onClick={() => setComm((v) => !v)}><Glyph name="message" /></button>
          ) : null}
          {mod.details ? <button type="button" className={s.toggle} aria-label={mod.detailsLabel ?? `${mod.label} · ${CARD_WORDS.orderDetails}`} title={mod.detailsLabel ?? CARD_WORDS.orderDetails} aria-controls={`${ids}-details`} aria-expanded={details} onClick={() => setDetails(value => !value)}>⋯</button> : null}
          {mod.items ? (
            <button type="button" className={`${s.toggle} ${s.toggleItems} ${communication ? "" : s.toggleFirst}`} aria-label={CARD_WORDS.items} title={CARD_WORDS.items} aria-controls={`${ids}-items`} aria-expanded={items} onClick={() => setItems((v) => !v)}><Glyph name="box" /></button>
          ) : null}
          {p.timeline ? (
            <button type="button" className={`${s.toggle} ${s.toggleTimeline} ${communication || mod.items ? "" : s.toggleFirst}`} title={CARD_WORDS.timeline} aria-label={timeline ? CARD_WORDS.hideTimeline : CARD_WORDS.showTimeline} aria-expanded={timeline} onClick={() => setTimeline((v) => !v)}><Glyph name="history" /></button>
          ) : null}
        </nav>
        {p.document && documentOpen ? <div id={`${ids}-document`} className={s.body} role="region" aria-label={p.document.label}>
          {p.document.preview(closeDocument)}
        </div> : null}
        <article>
          <div className={s.body}>
            {summary.length ? (
              <div className={s.strip} data-cells={summary.length}>
                {summary.map((f) => (f.editor || f.opensItems ? (
                  <button key={f.key} type="button" className={s.cell} aria-expanded={marked === f.key} onClick={() => openFact(f)}>
                    <small>{f.label}{f.editable ? <span className={s.arrow} aria-hidden="true">▾</span> : null}</small>
                    {f.status ? <strong><span>{f.value}</span><span className={s.status}>{f.status}</span></strong> : <strong className={s.clamp}>{f.value}</strong>}
                  </button>
                ) : (
                  <div key={f.key} className={`${s.cell} ${s.readCell}`}><span>{f.label}</span><strong className={s.clamp}>{f.value}{f.status ? <span className={s.status}>{f.status}</span> : null}</strong></div>
                )))}
              </div>
            ) : null}
            {editingFact?.editor ? <div className={s.editor}>{editingFact.editor(close)}</div> : null}
            {mod.details && details ? <div id={`${ids}-details`}>{mod.details}</div> : null}
            {mod.items && items ? <div id={`${ids}-items`}>{mod.items}</div> : null}
          </div>
        </article>
        {communication && comm ? <CardCommunicationPanel key={mod.key} id={`${ids}-comm`} config={communication} onClose={() => setComm(false)} /> : null}
        {p.timeline && timeline ? <CardTimeline events={p.timeline} status={p.timelineStatus} timeZone={p.timeZone ?? CARD_TIME_ZONE} onClose={() => setTimeline(false)} /> : null}
      </section>
    </div>
  );
}

/* ---------- editor building blocks for module-supplied editors ---------- */
/** Cancel then Save, at the right. Save closes the editor only when the module reports success. */
export function CardEditorButtons({ onSave, onCancel, error, disabled }: { onSave: () => void; onCancel: () => void; error?: string | null; disabled?: boolean }) {
  return (
    <>
    {error ? <p className={s.editorError} role="alert">{error}</p> : null}
    <div className={`${s.buttons} ${s.editorButtons}`}>
      <button type="button" className={s.btn} disabled={disabled} onClick={onSave}>{CARD_WORDS.save}</button>
      <button type="button" className={s.btn} onClick={onCancel}>{CARD_WORDS.cancel}</button>
    </div>
    </>
  );
}
/** One condition per line. */
export function CardChecklist({ label, items }: { label: string; items: { text: string; done: boolean }[] }) {
  return (
    <div className={s.doChecklist} aria-label={label}>
      {items.map((i) => <div key={i.text}><span aria-hidden="true">{i.done ? "☑" : "□"}</span> {i.text}</div>)}
    </div>
  );
}

/* ---------- Communication ---------- */
function CardCommunicationPanel({ id, config, onClose }: { id: string; config: CardCommunication; onClose: () => void }) {
  const store = useMemo(() => config.store ?? browserTemplateStore(), [config.store]);
  const [channel, setChannel] = useState<CardChannel>("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [manager, setManager] = useState(false);
  const [search, setSearch] = useState("");
  const [pick, setPick] = useState("");
  const [saved, setSaved] = useState<SavedTemplate[]>(() => store.load());
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const nameInput = useRef<HTMLInputElement | null>(null);
  const anchor = useRef<HTMLDivElement | null>(null);
  const moreButton = useRef<HTMLButtonElement | null>(null);
  const uid = useId();
  const knownPhones = useMemo(() => Object.fromEntries(config.recipients.filter((r) => r.phone).map((r) => [r.value, r.phone as string])), [config.recipients]);
  const group = config.recipients.find(r => r.value === recipient)?.whatsappUrl;
  const link = channel === "whatsapp" && group && /^https:\/\/chat\.whatsapp\.com\//.test(group) ? group : draftLink(channel, recipient, message, subject, knownPhones);

  useEffect(() => { if (picker) searchInput.current?.focus(); }, [picker]);
  /* Escape or a press outside closes the ⋯ menu; Escape returns focus to ⋯. */
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); moreButton.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (anchor.current && !anchor.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [menu]);

  function loadTemplate(value: string) {
    setPick(value);
    if (!value) return;
    const body = value.startsWith("saved:") ? saved.find((t) => t.id === value.slice(6))?.body : config.templates.find((t) => t.key === value)?.body;
    if (body === undefined) return;
    if (message.trim() && !window.confirm(CARD_WORDS.replaceDraft)) { if (!value.startsWith("saved:")) setPick(""); return; }
    setMessage(body);
    setPicker(false);
  }
  function openEditor() {
    setManager(false);
    setError("");
    dialog.current?.showModal?.();
    nameInput.current?.focus();
  }
  function saveTemplate() {
    const n = name.trim(), body = message.trim();
    if (!n || !body) { setError(!n ? CARD_WORDS.enterName : CARD_WORDS.writeFirst); return; }
    if (saved.some((t) => t.name.toLowerCase() === n.toLowerCase())) { setError(CARD_WORDS.nameUsed); return; }
    const item: SavedTemplate = { id: crypto.randomUUID(), name: n, body, audience: "Everyone" };
    const next = [...saved, item];
    if (!store.save(next)) { setError(CARD_WORDS.couldNotSave); return; }
    setSaved(next);
    setPick(`saved:${item.id}`);
    dialog.current?.close?.();
    setStatus(CARD_WORDS.templateSaved);
  }
  function remove(t: SavedTemplate) {
    if (!window.confirm(`Delete ${t.name}?`)) return;
    const next = saved.filter((x) => x.id !== t.id);
    if (!store.save(next)) return;
    setSaved(next);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(message); setStatus(CARD_WORDS.copied); } catch { setStatus(CARD_WORDS.copyFallback); }
  }
  function open() {
    if (!link) return;
    if (link.startsWith("mailto:")) window.location.href = link;
    else window.open(link, "_blank", "noopener");
  }
  const q = search.toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);

  return (
    <aside className={s.section} id={id}>
      <div className={s.sectionHead}>
        <h2>{CARD_WORDS.communication}</h2>
        <div className={s.headActions}>
          <select className={s.channel} aria-label={CARD_WORDS.channel} value={channel} onChange={(e) => setChannel(e.target.value as CardChannel)}>
            <option value="whatsapp">{CARD_WORDS.whatsapp}</option>
            <option value="email">{CARD_WORDS.email}</option>
          </select>
          <button type="button" className={s.btn} aria-label={CARD_WORDS.closeCommunication} onClick={onClose}>×</button>
        </div>
      </div>
      <div className={s.fieldLine}>
        <label htmlFor={`${uid}-to`}>{CARD_WORDS.to}</label>
        <input id={`${uid}-to`} list={channel === "whatsapp" ? `${uid}-people` : undefined} placeholder={channel === "email" ? CARD_WORDS.emailPlaceholder : CARD_WORDS.phonePlaceholder} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        <datalist id={`${uid}-people`}>{config.recipients.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</datalist>
      </div>
      {channel === "email" ? (
        <div className={s.fieldLine}>
          <label htmlFor={`${uid}-subject`}>{CARD_WORDS.subject}</label>
          <input id={`${uid}-subject`} placeholder={CARD_WORDS.subjectPlaceholder} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
      ) : null}
      <div className={s.messageToolbar}>
        <label htmlFor={`${uid}-message`}>{CARD_WORDS.message}</label>
        <div className={s.menuAnchor} ref={anchor}>
          <button ref={moreButton} type="button" className={`${s.btn} ${s.more}`} aria-label={CARD_WORDS.messageOptions} aria-expanded={menu} onClick={() => setMenu((v) => !v)}>⋯</button>
          {menu ? (
            <div className={s.menu}>
              <button type="button" onClick={() => { setMenu(false); setPicker(true); }}>{CARD_WORDS.findTemplate}</button>
              <button type="button" onClick={() => { setMenu(false); openEditor(); }}>{CARD_WORDS.saveAsTemplate}</button>
              <button type="button" onClick={() => { setMenu(false); setManager(true); dialog.current?.close?.(); }}>{CARD_WORDS.manageTemplates}</button>
            </div>
          ) : null}
        </div>
      </div>
      {picker ? (
        <div className={s.picker}>
          <div className={s.pickerHead}><strong>{CARD_WORDS.findTemplateTitle}</strong><button type="button" className={s.btn} onClick={() => setPicker(false)}>×</button></div>
          <input ref={searchInput} placeholder={CARD_WORDS.searchTemplates} value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label={CARD_WORDS.messageTemplate} value={pick} onChange={(e) => loadTemplate(e.target.value)}>
            <option value="">{CARD_WORDS.chooseTemplate}</option>
            {config.templates.filter((t) => matches(t.label)).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            {saved.filter((t) => matches(t.name)).map((t) => <option key={t.id} value={`saved:${t.id}`}>{t.name}</option>)}
          </select>
        </div>
      ) : null}
      <textarea id={`${uid}-message`} className={s.message} placeholder={CARD_WORDS.messagePlaceholder} value={message} onChange={(e) => setMessage(e.target.value)} />
      <dialog ref={dialog} className={s.dialog} aria-labelledby={`${uid}-save-title`}>
        <div className={s.pickerHead}><strong id={`${uid}-save-title`}>{CARD_WORDS.saveTemplate}</strong><button type="button" className={s.btn} aria-label={CARD_WORDS.closeSaveTemplate} onClick={() => dialog.current?.close?.()}>×</button></div>
        <label htmlFor={`${uid}-name`}>{CARD_WORDS.name}</label>
        <input ref={nameInput} id={`${uid}-name`} placeholder={config.namePlaceholder ?? "Confirm delivery date"} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <div className={s.buttons}>
          <button type="button" className={s.btn} onClick={() => dialog.current?.close?.()}>{CARD_WORDS.cancel}</button>
          <button type="button" className={`${s.btn} ${s.primary}`} onClick={saveTemplate}>{CARD_WORDS.save}</button>
        </div>
        <div className={s.dialogError} role="status">{error}</div>
      </dialog>
      {manager ? (
        <div className={s.manager}>
          <div className={s.pickerHead}><strong>{CARD_WORDS.savedTemplates}</strong><button type="button" className={s.btn} onClick={() => setManager(false)}>{CARD_WORDS.close}</button></div>
          <div>
            {saved.length ? saved.map((t) => (
              <div key={t.id} className={s.templateRow}><span>{t.name} · {t.audience}</span><button type="button" className={s.btn} onClick={() => remove(t)}>{CARD_WORDS.delete}</button></div>
            )) : CARD_WORDS.noSavedTemplates}
          </div>
        </div>
      ) : null}
      <div className={s.attachmentLine}>
        <button type="button" className={s.iconBtn} title={CARD_WORDS.attachEvidence} aria-label={CARD_WORDS.attachEvidence} onClick={() => fileInput.current?.click()}><Glyph name="clip" /></button>
        <span className={s.note}>{files.length ? CARD_WORDS.evidenceCount(files.length) : CARD_WORDS.evidenceNone}</span>
        <input ref={fileInput} type="file" accept="image/*,video/*,.pdf" multiple hidden onChange={(e) => { setFiles((f) => [...f, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      {files.length ? (
        <div className={s.evidenceList}>
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className={s.evidenceChip}><span>{f.name}</span><button type="button" aria-label={CARD_WORDS.remove(f.name)} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>×</button></div>
          ))}
        </div>
      ) : null}
      <div className={`${s.buttons} ${s.sendRow}`}>
        <button type="button" className={s.btn} onClick={() => void copy()}>{CARD_WORDS.copyMessage}</button>
        <button type="button" className={s.btn} disabled={!link} onClick={open}>{channel === "email" ? CARD_WORDS.openEmail : CARD_WORDS.openWhatsApp}</button>
      </div>
      <p className={`${s.note} ${s.status}`}>{status}</p>
    </aside>
  );
}

/* ---------- Timeline ---------- */
function CardTimeline({ events, status, timeZone, onClose }: { events: CardTimelineEvent[]; status?: string; timeZone: string; onClose: () => void }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2>{CARD_WORDS.timeline}</h2>
        <button type="button" className={s.btn} aria-label={CARD_WORDS.closeTimeline} onClick={onClose}>×</button>
      </div>
      {status ? <p role="status">{status}</p> : null}
      <ol className={s.events}>
        {events.map((e) => {
          const t = e.at ? formatCardTime(e.at, timeZone) : null;
          return (
            <li key={e.id} className={s.event}>
              <span className={s.avatar} aria-label={CARD_WORDS.recordedBy(e.actorName)} title={CARD_WORDS.recordedBy(e.actorName)} tabIndex={0}>{e.actorInitial}</span>
              <div className={s.eventBody}>
                <div className={s.eventMeta}>
                  <strong>{e.summary}</strong>
                  {t ? (
                    <time dateTime={e.at} title={CARD_WORDS.recordedAt(t.full)}>{t.short}</time>
                  ) : (
                    <time dateTime={e.date} title={`${e.dateLabel} · ${CARD_WORDS.exactTimeUnavailable}`}>{e.dateLabel}</time>
                  )}
                </div>
                {e.result || !t ? (
                  <div className={s.eventResult}>
                    {e.result ?? null}
                    {!t ? <span className={s.missingTime}>{e.result ? " " : ""}· {CARD_WORDS.timeUnavailable}</span> : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
