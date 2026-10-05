/**
 * /ui example for the kit `CompactModuleCard`: one shared header with the Info
 * and Delivery modules, from the owner's reference page
 * (docs/ui-reference/module-card-reference.html).
 *
 * UI EXAMPLE ONLY. The SO-1368 order facts are the verified handoff sample.
 * Delivery's Stock 1/1 is a layout sample, not verified stock, and every
 * Customer or Logistics "save" here only changes this page: nothing is written
 * to the ERP, and a date confirmed here is not an order fact.
 *
 * Info and Delivery facts, editors and items are MODULE content passed into the
 * card; another module passes its own.
 */
// design-standard: not-a-list-page — a /ui component sample; its tables are the card's item lists.
import { useState } from "react";
import CompactModuleCard, { CardChecklist, CardEditorButtons, compactCardStyles as s, type CardFact, type CardTimelineEvent } from "@/components/kit/CompactModuleCard";
import Button from "@/components/kit/Button";

/** Card widths of the reference page at browser widths 1146 · 480 · 440 · 420 · 390. */
export const CARD_WIDTHS = [560, 440, 416, 396, 366] as const;
const PRESETS = {
  receiving: { label: "Receiving · cancelled preview", module: "receipt", open: {}, warehouseLeg: false },
  info: { label: "Info · default", module: "info", open: {}, warehouseLeg: false },
  delivery: { label: "Delivery · default", module: "delivery", open: {}, warehouseLeg: false },
  infoLong: { label: "Info · long address", module: "info", open: {}, warehouseLeg: false },
  infoAll: { label: "Info · all open", module: "info", open: { items: true, communication: true, timeline: true }, warehouseLeg: false },
  deliveryAll: { label: "Delivery · all open", module: "delivery", open: { items: true, communication: true, timeline: true }, warehouseLeg: false },
  warehouseLeg: { label: "Delivery · warehouse leg", module: "delivery", open: {}, warehouseLeg: true },
} as const;
type PresetKey = keyof typeof PRESETS;

const PAYMENT: CardTimelineEvent = {
  id: "payment-rc-300926-3735",
  actorName: "Jess",
  actorInitial: "J",
  summary: "Payment received · RM1,380",
  at: "2026-09-30T08:08:32.181911Z",
  result: "RC-300926-3735",
};
const TARGET = "2026-10-31";
/** The existing Sales Order page for the sample order (the reference page opens the same order). */
export const SAMPLE_ORDER_PATH = "/operation/orders/so/82cee77c-67df-4515-8b4e-7b81796e1423";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RESULTS = ["No Answer", "Asked to Call Again", "Waiting for Customer Reply", "Requested Another Date", "Confirmed"];

/** What the customer agreed, as the module would hold it. */
interface Arrangement { result: string; date: string; slot: string; time: string }
const NONE: Arrangement = { result: "", date: "", slot: "", time: "" };

function dayLabel(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
function timeLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** The Customer cell: date plus only the precision actually agreed. */
function customerSummary(a: Arrangement): { value: string; status?: string } {
  if (a.result !== "Confirmed" || !a.date) return { value: "Date not confirmed" };
  const extra = a.slot === "Specific time" && a.time ? timeLabel(a.time) : a.slot === "Morning" || a.slot === "Afternoon" ? a.slot : "";
  return { value: extra ? `${dayLabel(a.date)} · ${extra}` : dayLabel(a.date), status: "Date confirmed" };
}
function daysToTarget() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
  return Math.round((Date.parse(`${TARGET}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
function timeOptions() {
  const out = [<option key="" value="">Choose time</option>];
  for (let h = 8; h <= 20; h++) for (const m of [0, 30]) {
    const v = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    out.push(<option key={v} value={v}>{timeLabel(v)}</option>);
  }
  return out;
}

/**
 * The existing arrangement form. Its draft starts from what was saved, so a
 * reopen shows the saved answer and Cancel leaves the summary unchanged. A
 * refused or failed save keeps the draft and says why.
 */
function CustomerEditor({ saved, close, onSave }: { saved: Arrangement; close: () => void; onSave: (a: Arrangement) => string | null }) {
  const [draft, setDraft] = useState<Arrangement>(saved);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Arrangement>) => setDraft((d) => ({ ...d, ...patch }));
  function save() {
    if (!draft.result) return setError("Choose the contact result.");
    if (draft.result === "Confirmed" && !draft.date) return setError("Choose the confirmed date.");
    if (draft.result === "Confirmed" && draft.slot === "Specific time" && !draft.time) return setError("Choose the time.");
    const failed = onSave(draft);
    if (failed) return setError(failed);
    close();
  }
  return (
    <>
      <strong>Record delivery arrangement</strong>
      <div className={s.arrangeSplit}>
        <div className={s.originalDate}><label htmlFor="cc-requested">Customer Requested<br />Delivery Date</label><input id="cc-requested" type="text" value="Sat, 31 Oct 2026" disabled /></div>
        <div className={s.arrangeUpdate}>
          <label>Contact result</label>
          <select aria-label="Contact result" value={draft.result} onChange={(e) => set({ result: e.target.value })}>
            <option value="">Choose result</option>{RESULTS.map((r) => <option key={r}>{r}</option>)}
          </select>
          {draft.result === "Confirmed" ? (
            <div className={s.fieldPair}>
              <div><label>Confirmed Delivery</label><input type="date" aria-label="Confirmed Delivery" value={draft.date} onChange={(e) => set({ date: e.target.value })} /></div>
              <div><label>Confirmed Time · optional</label><select aria-label="Confirmed Time · optional" value={draft.slot} onChange={(e) => set({ slot: e.target.value, time: e.target.value === "Specific time" ? draft.time : "" })}><option value="">Not specified</option><option>Morning</option><option>Afternoon</option><option>Specific time</option></select>
                {draft.slot === "Specific time" ? <div><select aria-label="Confirmed delivery time" value={draft.time} onChange={(e) => set({ time: e.target.value })}>{timeOptions()}</select></div> : null}</div>
            </div>
          ) : (
            <div><label>Next follow-up</label><div className={s.followPair}><input type="date" aria-label="Next follow-up date" /><select aria-label="Next follow-up time">{timeOptions()}</select></div></div>
          )}
        </div>
      </div>
      <CardEditorButtons onCancel={close} onSave={save} error={error} />
    </>
  );
}

function LogisticsEditor({ saved, close, onSave }: { saved: string; close: () => void; onSave: (company: string) => void }) {
  const [company, setCompany] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <strong>Assign logistics</strong>
      <select aria-label="Logistics company" value={company} onChange={(e) => setCompany(e.target.value)}>
        <option value="">Choose company</option><option>NETS</option><option>AL</option><option>TEOW</option><option>TT</option>
      </select>
      <CardEditorButtons error={error} onCancel={close} onSave={() => { if (!company) return setError("Choose the company."); onSave(company); close(); }} />
    </>
  );
}

export default function CompactCardExample() {
  const [width, setWidth] = useState<number>(560);
  const [preset, setPreset] = useState<PresetKey>("info");
  const [logistics, setLogistics] = useState("");
  const [arrangement, setArrangement] = useState<Arrangement>(NONE);
  const [failNext, setFailNext] = useState(false);
  const [closed, setClosed] = useState(false);
  const [events, setEvents] = useState<CardTimelineEvent[]>([PAYMENT]);
  const days = daysToTarget();
  const customer = customerSummary(arrangement);
  const p = PRESETS[preset];

  function addEvent(summary: string, detail: string) {
    setEvents((all) => [{ id: `preview-${Date.now()}`, actorName: "Preview recorder", actorInitial: "P", summary, at: new Date().toISOString(), result: detail }, ...all]);
  }
  function saveArrangement(a: Arrangement): string | null {
    if (failNext) { setFailNext(false); return "Customer date not recorded · Try again"; }
    setArrangement(a);
    const shown = customerSummary(a);
    /* The recorder (avatar) is whoever typed it in; the customer's answer reached them through Logistics. */
    addEvent("Delivery · Contact result saved", a.result === "Confirmed" ? `Confirmed · ${shown.value}` : a.result);
    return null;
  }

  const customerFact: CardFact = p.warehouseLeg
    ? { key: "receiver", label: "{Receiving warehouse}", value: "Date not confirmed" }
    : {
        key: "customer", label: "Customer", value: customer.value, status: customer.status, editable: true,
        editor: (close) => <CustomerEditor saved={arrangement} close={close} onSave={saveArrangement} />,
      };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Card width">
        {CARD_WIDTHS.map((w) => (
          <Button key={w} size="sm" variant={w === width ? "primary" : "neutral"} data-testid={`card-width-${w}`} onClick={() => { setWidth(w); setClosed(false); }}>{`${w}px`}</Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Card state">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <Button key={k} size="sm" variant={k === preset ? "primary" : "neutral"} data-testid={`card-state-${k}`} onClick={() => { setPreset(k); setClosed(false); }}>{PRESETS[k].label}</Button>
        ))}
        <Button size="sm" variant={failNext ? "primary" : "neutral"} data-testid="card-fail-next" onClick={() => setFailNext((v) => !v)}>{failNext ? "Preview: next save fails" : "Preview: saves succeed"}</Button>
      </div>
      <div data-testid="compact-card-frame" style={{ width, maxWidth: "100%" }}>
        {closed ? null : preset === "receiving" ? <CompactModuleCard
          key={`receipt-${width}`} name="Sample supplier" reference="GRN-261004-1234" referenceStatus="Cancelled"
          modulesLabel="Receiving" initialModule="receipt" openLabel="Receiving"
          onOpen={() => window.open("/operation?tab=receiving", "_blank", "noopener")}
          onClose={() => setClosed(true)} modules={[{
            key: "receipt", label: "Receiving", detailsLabel: "Receipt details",
            summary: [{ key: "received", label: "Received Qty", value: "2" }, { key: "damaged", label: "Damaged Qty", value: "1" }, { key: "wrong", label: "Wrong Item Qty", value: "0" }, { key: "extra", label: "Extra Qty", value: "0" }],
            details: <p>Preview only · sample receipt facts</p>,
          }]} /> : <CompactModuleCard
          key={`${preset}-${width}`}
          name="Jimmy"
          reference="SO-1368"
          phone="019-83372393"
          sales={{ orderDate: "30 Sep 2026", proceedDate: "30 Sep 2026", salesLocation: "Carres Kota Damansara", salesperson: "Alvin" }}
          address={{ area: "Ampang", full: preset === "infoLong" ? "Unit A-18-08, Block A, Residensi Example Heights, Jalan Example Utama 12, Taman Example Permai, 68000 Ampang, Selangor, Malaysia" : "1888. jalan Pillow, 68000 Ampang, Selangor", facts: [{ kind: "building", label: "Building", value: "Condo · Floor 1" }, { kind: "access", label: "Access", value: "No lift" }] }}
          target={{ date: "31 Oct", badge: `${days}d` }}
          onOpen={() => window.open(SAMPLE_ORDER_PATH, "_blank", "noopener")}
          onClose={() => setClosed(true)}
          initialModule={p.module}
          initiallyOpen={p.open}
          modules={[
            {
              key: "info", label: "Info", opensHeaderDetails: true,
              summary: [
                { key: "total", label: "Total payable", value: "RM2,759.00" },
                { key: "paid", label: "Paid to date", value: "RM1,380.00" },
                { key: "outstanding", label: "Balance due", value: "RM1,379.00" },
              ],
              items: (
                <table className={s.orderItems}>
                  <thead><tr><th>Item</th><th className={s.number}>Qty</th><th className={s.number}>Unit price</th><th className={s.number}>Amount</th></tr></thead>
                  <tbody>
                    <tr><td>B1201S · King</td><td className={s.number}>1</td><td className={s.number}>2,499.00</td><td className={s.number}>2,499.00</td></tr>
                    <tr><td>Dispose old bed frame <small className={s.itemConfig}>King</small></td><td className={s.number}>1</td><td className={s.number}>100.00</td><td className={s.number}>100.00</td></tr>
                    <tr><td>Dispose old mattress <small className={s.itemConfig}>King ×2</small></td><td className={s.number}>2</td><td className={s.number}>80.00</td><td className={s.number}>160.00</td></tr>
                  </tbody>
                </table>
              ),
            },
            { key: "purchasing", label: "Purchasing", disabled: true },
            { key: "warehouse", label: "Warehouse", disabled: true },
            {
              key: "delivery", label: "Delivery",
              summary: [
                /* Goods only: the two disposal services are not goods and are not counted. */
                { key: "stock", label: "Stock", value: "1/1", status: "Ready", opensItems: true },
                {
                  key: "logistics", label: "Logistics", value: logistics || "Not assigned", editable: true,
                  editor: (close) => <LogisticsEditor saved={logistics} close={close} onSave={(c) => { setLogistics(c); addEvent("Delivery · Logistics assigned", c); }} />,
                },
                customerFact,
                {
                  key: "do", label: "DO", value: "Data not loaded",
                  editor: () => (
                    <>
                      <strong>Delivery Order</strong>
                      <CardChecklist label="Automatic DO conditions" items={[{ text: "Stock ready", done: false }, { text: "Payment cleared", done: false }, { text: "Customer confirmed date", done: false }]} />
                    </>
                  ),
                },
              ],
              items: (
                <table className={s.items}>
                  <thead><tr><th>Item</th><th>Qty</th><th>Stock</th></tr></thead>
                  <tbody>
                    <tr><td>B1201S · King</td><td>1</td><td>1/1 Ready</td></tr>
                    <tr><td>Dispose old bed frame</td><td>1</td><td>Service</td></tr>
                    <tr><td>Dispose old mattress</td><td>2</td><td>Service</td></tr>
                  </tbody>
                </table>
              ),
            },
          ]}
          communication={{
            recipients: [{ value: "Jimmy · +601983372393", label: "Customer", phone: "+601983372393" }],
            templates: [
              { key: "confirmation", label: "Confirm delivery date", body: "Hi, please contact the customer for SO-1368 and confirm the delivery date. Please record the customer’s response." },
              { key: "followup", label: "Follow up with logistics", body: "Hi, please provide the latest customer contact result and next follow-up for SO-1368." },
            ],
          }}
          timeline={events}
        />}
      </div>
    </div>
  );
}
