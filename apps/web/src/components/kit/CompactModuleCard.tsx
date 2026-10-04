/**
 * CompactModuleCard — the owner-confirmed compact module card (UI MASTER §4.3,
 * Jess 2026-10-03), as one reusable kit component.
 *
 * Built from the confirmed Delivery reference (docs/ui-reference/delivery-card-*)
 * element for element, and verified against its measurements by
 * `scripts/compact-card-parity.mjs`. Each module passes its OWN facts, editors,
 * items, recipients, templates and timeline events; the card owns only the
 * arrangement and the interaction. Business gates stay with the owning module.
 *
 * Palette, font family, radii and the drawn glyphs are the reference's own and
 * await the owner's token decision — see `compact-card.module.css`.
 *
 * Reference boundary, unchanged: Open WhatsApp / Open email open a DRAFT
 * (wa.me / mailto) and never mark anything sent; copying never records contact;
 * saved message templates live in this browser only; attached files are not
 * uploaded.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import s from "./compact-card.module.css";

/** Class map for module-supplied editor content inside the card (labels, checklists, splits). */
export const compactCardStyles = s;

/* ---------- the reference's drawn glyphs (pending the owner's token decision) ---------- */
const GLYPH = {
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72l.69 2.79a2 2 0 0 1-.45 2.11L8.09 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45l2.79.69A2 2 0 0 1 22 16.92z" />,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  calendar: <><path d="M8 2v4M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h2M14 6h2M8 10h2M14 10h2M8 14h2M14 14h2" /></>,
  access: <path d="M3 20h6v-6h6V8h6M3 4h18" />,
  message: <><path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0Z" /><path d="M7 10h10M7 14h6" /></>,
  box: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9" />,
  history: <><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
  clip: <path d="m8 12 7-7a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L14 2M6 16l10-10" />,
};
function Glyph({ name }: { name: keyof typeof GLYPH }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{GLYPH[name]}</svg>;
}

/* ---------- words: the owner-confirmed reference copy (2026-10-03) ---------- */
export const CARD_WORDS = {
  showAddress: "Show delivery address",
  modules: "Order modules",
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
  timeUnavailable: "Time unavailable",
  exactTimeUnavailable: "Exact time unavailable",
} as const;

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
  /** Shows the ▾ on the label: the fact opens an inline editor. */
  editable?: boolean;
  /** Inline editor content; call `close` to fold it. */
  editor?: (close: () => void) => ReactNode;
  /** Opening this fact shows the item list instead of an editor (Stock). */
  opensItems?: boolean;
}
export interface CardModuleTab { key: string; label: string; disabled?: boolean }
export interface CardRecipient { value: string; label: string; phone?: string }
export interface CardTemplate { key: string; label: string; body: string }
export interface CardTimelineEvent {
  id: string;
  actorName: string;
  actorInitial: string;
  summary: string;
  /** Machine date `YYYY-MM-DD`, shown as `dateLabel`. */
  date: string;
  dateLabel: string;
  /** Shown beside the date when the source records it; never invented. */
  timeLabel?: string | null;
  result?: string;
}
export interface CardCommunication {
  recipients: CardRecipient[];
  templates: CardTemplate[];
  store?: TemplateStore;
  /** Sample name in the save dialog. */
  namePlaceholder?: string;
}
export interface CompactModuleCardProps {
  name: string;
  reference: string;
  phone?: string;
  address?: { area: string; full: string; facts?: { kind: "building" | "access"; label: string; value: string }[] };
  target?: { date: string; badge?: string };
  openLabel?: string;
  onOpen?: () => void;
  closeLabel?: string;
  onClose?: () => void;
  modules: CardModuleTab[];
  currentModule: string;
  facts: CardFact[];
  items?: ReactNode;
  itemsLabel?: { show: string; hide: string };
  /** A short note under the facts after a save, e.g. the recorded time. */
  savedNote?: ReactNode;
  communication?: CardCommunication;
  timeline?: CardTimelineEvent[];
  initiallyOpen?: { communication?: boolean; timeline?: boolean; items?: boolean };
}

export default function CompactModuleCard(p: CompactModuleCardProps) {
  const [address, setAddress] = useState(false);
  const [items, setItems] = useState(!!p.initiallyOpen?.items);
  const [comm, setComm] = useState(!!p.initiallyOpen?.communication);
  const [timeline, setTimeline] = useState(!!p.initiallyOpen?.timeline);
  const [editing, setEditing] = useState<string | null>(null);
  const [marked, setMarked] = useState<string | null>(null);
  const ids = useId();
  const itemsLabel = p.itemsLabel ?? { show: "Show delivery items", hide: "Hide delivery items" };

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
  const editingFact = p.facts.find((f) => f.key === editing);

  return (
    <div className={s.cq}>
      <section className={s.panel}>
        <header className={s.header}>
          <div className={s.identity}>
            <strong>{p.name}</strong>
            <small className={s.contactLine}><span>{p.reference}</span>{p.phone ? <><Glyph name="phone" /><span>{p.phone}</span></> : null}</small>
          </div>
          <div className={s.addressBox}>
            {p.address ? (
              <button type="button" className={s.addressButton} aria-label={CARD_WORDS.showAddress} title={p.address.full} aria-expanded={address} onClick={() => setAddress((v) => !v)}>
                <Glyph name="pin" /><span>{p.address.area}</span><span className={s.chevron} aria-hidden="true">{address ? "▴" : "▾"}</span>
              </button>
            ) : null}
          </div>
          <div className={s.target}>
            {p.target ? <><b><Glyph name="calendar" />{p.target.date}</b>{p.target.badge ? <small className={s.badge}>{p.target.badge}</small> : null}</> : null}
          </div>
          <div className={s.actions}>
            <button type="button" aria-label={p.openLabel ?? "Open order"} title={p.openLabel ?? "Open order"} onClick={p.onOpen}>↗</button>
            <button type="button" aria-label={p.closeLabel ?? "Close panel"} title={p.closeLabel ?? "Close panel"} onClick={p.onClose}>×</button>
          </div>
        </header>
        {p.address && address ? (
          <div className={s.addressDetail}>
            <div>{p.address.full}</div>
            {p.address.facts?.length ? (
              <div className={s.locationFacts}>
                {p.address.facts.map((f) => (
                  <div key={f.label} className={s.factBox}><div aria-label={f.label}><Glyph name={f.kind} /></div><strong>{f.value}</strong></div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <nav className={s.moduleNav} aria-label={CARD_WORDS.modules}>
          {p.modules.map((m) => (
            <button key={m.key} type="button" disabled={m.disabled} className={m.key === p.currentModule ? s.selected : undefined} aria-current={m.key === p.currentModule ? "page" : undefined}>{m.label}</button>
          ))}
          {p.communication ? (
            <button type="button" className={`${s.toggle} ${s.toggleFirst}`} aria-label={CARD_WORDS.communication} title={CARD_WORDS.communication} aria-controls={`${ids}-comm`} aria-expanded={comm} onClick={() => setComm((v) => !v)}><Glyph name="message" /></button>
          ) : null}
          {p.items ? (
            <button type="button" className={`${s.toggle} ${s.toggleItems} ${p.communication ? "" : s.toggleFirst}`} aria-label={items ? itemsLabel.hide : itemsLabel.show} title={items ? itemsLabel.hide : itemsLabel.show} aria-controls={`${ids}-items`} aria-expanded={items} onClick={() => setItems((v) => !v)}><Glyph name="box" /></button>
          ) : null}
          {p.timeline ? (
            <button type="button" className={`${s.toggle} ${s.toggleTimeline} ${p.communication || p.items ? "" : s.toggleFirst}`} title={CARD_WORDS.timeline} aria-label={timeline ? CARD_WORDS.hideTimeline : CARD_WORDS.showTimeline} aria-expanded={timeline} onClick={() => setTimeline((v) => !v)}><Glyph name="history" /></button>
          ) : null}
        </nav>
        <article>
          <div className={s.body}>
            <div className={s.strip}>
              {p.facts.map((f) => (
                <button key={f.key} type="button" className={s.cell} aria-expanded={marked === f.key} onClick={() => openFact(f)}>
                  <small>{f.label}{f.editable ? " ▾" : ""}</small><strong>{f.value}</strong>
                </button>
              ))}
            </div>
            {editingFact?.editor ? <div className={s.editor}>{editingFact.editor(close)}</div> : null}
            {p.savedNote ? <div className={s.saveNote}>{p.savedNote}</div> : null}
            {p.items && items ? <div id={`${ids}-items`}>{p.items}</div> : null}
          </div>
        </article>
        {p.communication && comm ? <CardCommunicationPanel id={`${ids}-comm`} config={p.communication} onClose={() => setComm(false)} /> : null}
        {p.timeline && timeline ? <CardTimeline events={p.timeline} onClose={() => setTimeline(false)} /> : null}
      </section>
    </div>
  );
}

/* ---------- editor building blocks for module-supplied editors ---------- */
export function CardEditorButtons({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className={s.buttons}>
      <button type="button" className={s.btn} onClick={onSave}>{CARD_WORDS.save}</button>
      <button type="button" className={s.btn} onClick={onCancel}>{CARD_WORDS.cancel}</button>
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
  const uid = useId();
  const knownPhones = useMemo(() => Object.fromEntries(config.recipients.filter((r) => r.phone).map((r) => [r.value, r.phone as string])), [config.recipients]);
  const link = draftLink(channel, recipient, message, subject, knownPhones);

  useEffect(() => { if (picker) searchInput.current?.focus(); }, [picker]);

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
        <div className={s.menuAnchor}>
          <button type="button" className={`${s.btn} ${s.more}`} aria-label={CARD_WORDS.messageOptions} aria-expanded={menu} onClick={() => setMenu((v) => !v)}>⋯</button>
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
function CardTimeline({ events, onClose }: { events: CardTimelineEvent[]; onClose: () => void }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2>{CARD_WORDS.timeline}</h2>
        <button type="button" className={s.btn} aria-label={CARD_WORDS.closeTimeline} onClick={onClose}>×</button>
      </div>
      <ol className={s.events}>
        {events.map((e) => (
          <li key={e.id} className={s.event}>
            <span className={s.avatar} aria-label={CARD_WORDS.recordedBy(e.actorName)} title={CARD_WORDS.recordedBy(e.actorName)} tabIndex={0}>{e.actorInitial}</span>
            <div className={s.eventBody}>
              <div className={s.eventMeta}>
                <strong>{e.summary}</strong>
                <time dateTime={e.date} title={e.timeLabel ? `${e.dateLabel} · ${e.timeLabel}` : `${e.dateLabel} · ${CARD_WORDS.exactTimeUnavailable}`}>
                  {e.timeLabel ? `${e.dateLabel}, ${e.timeLabel}` : e.dateLabel}
                </time>
              </div>
              {e.result || !e.timeLabel ? (
                <div className={s.eventResult}>
                  {e.result ? `${e.result} ` : null}
                  {!e.timeLabel ? <span className={s.missingTime}>· {CARD_WORDS.timeUnavailable}</span> : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
