/**
 * /ui example for the kit `CompactModuleCard`: one shared header with the Info
 * and Delivery modules, filled from the owner's 2026-10-04 handoff
 * (docs/ui-reference/module-card-reference.html). The SO-1368 order facts are
 * the verified sample; Delivery's Stock 1/1 is a layout sample, not verified
 * stock. Saves here are preview only and write nothing to the ERP.
 *
 * Info and Delivery facts, editors and items are MODULE content passed into the
 * card; another module passes its own.
 */
// design-standard: not-a-list-page — a /ui component sample; its tables are the card's item lists.
import { useState } from "react";
import CompactModuleCard, { CardChecklist, CardEditorButtons, compactCardStyles as s, type CardTimelineEvent } from "@/components/kit/CompactModuleCard";
import Button from "@/components/kit/Button";

/** Card widths of the reference page at browser widths 1146 · 480 · 440 · 420 · 390. */
export const CARD_WIDTHS = [560, 440, 416, 396, 366] as const;
const PRESETS = {
  info: { label: "Info · default", module: "info", open: {} },
  delivery: { label: "Delivery · default", module: "delivery", open: {} },
  infoAll: { label: "Info · all open", module: "info", open: { items: true, communication: true, timeline: true } },
  deliveryAll: { label: "Delivery · all open", module: "delivery", open: { items: true, communication: true, timeline: true } },
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

function daysToTarget() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
  return Math.round((Date.parse(`${TARGET}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
function timeOptions() {
  const out = [<option key="" value="">Choose time</option>];
  for (let h = 8; h <= 20; h++) for (const m of [0, 30]) {
    const v = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    out.push(<option key={v} value={v}>{`${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? " AM" : " PM"}`}</option>);
  }
  return out;
}

export default function CompactCardExample() {
  const [width, setWidth] = useState<number>(560);
  const [preset, setPreset] = useState<PresetKey>("info");
  const [logistics, setLogistics] = useState("No logistics picked");
  const [arrangement, setArrangement] = useState("No confirmed date");
  const [events, setEvents] = useState<CardTimelineEvent[]>([PAYMENT]);
  const [company, setCompany] = useState("");
  const [result, setResult] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const days = daysToTarget();

  function addEvent(summary: string, detail: string) {
    setEvents((all) => [{ id: `preview-${Date.now()}`, actorName: "Preview recorder", actorInitial: "P", summary, at: new Date().toISOString(), result: detail }, ...all]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Card width">
        {CARD_WIDTHS.map((w) => (
          <Button key={w} size="sm" variant={w === width ? "primary" : "neutral"} data-testid={`card-width-${w}`} onClick={() => setWidth(w)}>{`${w}px`}</Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Card state">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <Button key={k} size="sm" variant={k === preset ? "primary" : "neutral"} data-testid={`card-state-${k}`} onClick={() => setPreset(k)}>{PRESETS[k].label}</Button>
        ))}
      </div>
      <div data-testid="compact-card-frame" style={{ width, maxWidth: "100%" }}>
        <CompactModuleCard
          key={`${preset}-${width}`}
          name="Jimmy"
          reference="SO-1368"
          phone="019-83372393"
          sales={{ orderDate: "30 Sep 2026", salesLocation: "Carres Kota Damansara", salesperson: "Alvin" }}
          address={{ area: "Ampang", full: "1888. jalan Pillow, 68000 Ampang, Selangor", facts: [{ kind: "building", label: "Building", value: "Condo · Floor 1" }, { kind: "access", label: "Access", value: "No lift" }] }}
          target={{ date: "31 Oct", badge: `${days}d` }}
          initialModule={PRESETS[preset].module}
          initiallyOpen={PRESETS[preset].open}
          modules={[
            {
              key: "info", label: "Info", opensHeaderDetails: true,
              summary: [
                { key: "total", label: "Total", value: "RM2,759.00" },
                { key: "paid", label: "Paid", value: "RM1,380.00" },
                { key: "outstanding", label: "Outstanding", value: "RM1,379.00" },
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
                { key: "stock", label: "Stock", value: "1/1 Ready", opensItems: true },
                {
                  key: "logistics", label: "Logistics", value: logistics, editable: true,
                  editor: (close) => (
                    <>
                      <strong>Assign logistics</strong>
                      <select aria-label="Logistics company" value={company} onChange={(e) => setCompany(e.target.value)}>
                        <option value="">Choose company</option><option>NETS</option><option>AL</option><option>TEOW</option><option>TT</option>
                      </select>
                      <CardEditorButtons onCancel={close} onSave={() => { if (!company) return; setLogistics(company); addEvent("Delivery · Logistics assigned", company); close(); }} />
                    </>
                  ),
                },
                {
                  key: "arrangement", label: "Confirmed Delivery", value: arrangement, editable: true,
                  editor: (close) => (
                    <>
                      <strong>Record delivery arrangement</strong>
                      <div className={s.arrangeSplit}>
                        <div className={s.originalDate}><label htmlFor="cc-requested">Customer Requested<br />Delivery Date</label><input id="cc-requested" type="text" value="Sat, 31 Oct 2026" disabled /></div>
                        <div className={s.arrangeUpdate}>
                          <label>Contact result</label>
                          <select value={result} onChange={(e) => setResult(e.target.value)}>
                            <option value="">Choose result</option><option>No Answer</option><option>Asked to Call Again</option><option>Waiting for Customer Reply</option><option>Requested Another Date</option><option>Confirmed</option>
                          </select>
                          {result === "Confirmed" ? (
                            <div className={s.fieldPair}>
                              <div><label>Confirmed Delivery</label><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
                              <div><label>Confirmed Time · optional</label><select value={slot} onChange={(e) => setSlot(e.target.value)}><option value="">Not specified</option><option>Morning</option><option>Afternoon</option><option>Specific time</option></select>
                                {slot === "Specific time" ? <div><select aria-label="Confirmed delivery time">{timeOptions()}</select></div> : null}</div>
                            </div>
                          ) : (
                            <div><label>Next follow-up</label><div className={s.followPair}><input type="date" aria-label="Next follow-up date" /><select aria-label="Next follow-up time">{timeOptions()}</select></div></div>
                          )}
                        </div>
                      </div>
                      <CardEditorButtons onCancel={close} onSave={() => {
                        if (!result || (result === "Confirmed" && !date)) return;
                        const shown = result === "Confirmed" ? new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : result;
                        setArrangement(shown);
                        addEvent("Delivery · Contact result saved", result === "Confirmed" ? `${result} · ${shown}` : result);
                        close();
                      }} />
                    </>
                  ),
                },
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
                    <tr><td>Dispose old bed frame</td><td>1</td><td>—</td></tr>
                    <tr><td>Dispose old mattress</td><td>2</td><td>—</td></tr>
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
        />
      </div>
    </div>
  );
}
