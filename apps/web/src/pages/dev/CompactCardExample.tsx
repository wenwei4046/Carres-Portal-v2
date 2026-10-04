/**
 * /ui example for the kit `CompactModuleCard`, filled with the owner-confirmed
 * Delivery reference sample (docs/ui-reference/delivery-card-approved.html).
 * The sample is the confirmed layout example, not verified order data: Stock
 * 1/1 is not verified SO-1368 stock, and nothing here writes to the ERP.
 *
 * The Delivery editors below are MODULE content passed into the card; another
 * module passes its own facts and editors.
 */
import { useState } from "react";
import CompactModuleCard, { CardEditorButtons, compactCardStyles as s, type CardTimelineEvent } from "@/components/kit/CompactModuleCard";
import Button from "@/components/kit/Button";

/** Card widths that equal the reference page at browser widths 1146 · 480 · 440 · 420 · 390. */
export const CARD_WIDTHS = [560, 460, 420, 400, 370] as const;
const STATES = {
  closed: { label: "All closed", open: {} },
  measured: { label: "Communication + Timeline", open: { communication: true, timeline: true } },
  communication: { label: "Communication", open: { communication: true } },
  timeline: { label: "Timeline", open: { timeline: true } },
  items: { label: "Items", open: { items: true } },
} as const;
type StateKey = keyof typeof STATES;

const FIRST_EVENT: CardTimelineEvent = {
  id: "payment-rc3009263735",
  actorName: "Jess",
  actorInitial: "J",
  summary: "Payment received · RM1,380",
  date: "2026-09-30",
  dateLabel: "30 Sep 2026",
  timeLabel: null,
  result: "RC3009263735",
};

function myt() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short" }).format(new Date());
}
function mytTime() {
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date())} MYT`;
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
  const [state, setState] = useState<StateKey>("measured");
  const [logistics, setLogistics] = useState("No logistics picked");
  const [arrangement, setArrangement] = useState("No confirmed date");
  const [note, setNote] = useState<string | null>(null);
  const [events, setEvents] = useState<CardTimelineEvent[]>([FIRST_EVENT]);
  const [company, setCompany] = useState("");
  const [result, setResult] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");

  function addEvent(summary: string, detail: string) {
    setEvents((all) => [{ id: `preview-${Date.now()}`, actorName: "Preview recorder", actorInitial: "P", summary, date: new Date().toISOString().slice(0, 10), dateLabel: myt(), timeLabel: mytTime(), result: detail }, ...all]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Card width">
        {CARD_WIDTHS.map((w) => (
          <Button key={w} size="sm" variant={w === width ? "primary" : "neutral"} data-testid={`card-width-${w}`} onClick={() => setWidth(w)}>{`${w}px`}</Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Card state">
        {(Object.keys(STATES) as StateKey[]).map((k) => (
          <Button key={k} size="sm" variant={k === state ? "primary" : "neutral"} data-testid={`card-state-${k}`} onClick={() => setState(k)}>{STATES[k].label}</Button>
        ))}
      </div>
      <div data-testid="compact-card-frame" style={{ width, maxWidth: "100%" }}>
        <CompactModuleCard
          key={`${state}-${width}`}
          name="Jimmy"
          reference="SO-1368"
          phone="019-83372393"
          address={{ area: "Ampang", full: "1888. jalan Pillow, 68000 Ampang, Selangor", facts: [{ kind: "building", label: "Building", value: "Condo · Floor 1" }, { kind: "access", label: "Access", value: "No lift · Stair carry 0" }] }}
          target={{ date: "31 Oct", badge: "28d" }}
          modules={[{ key: "info", label: "Info", disabled: true }, { key: "purchasing", label: "Purchasing", disabled: true }, { key: "warehouse", label: "Warehouse", disabled: true }, { key: "delivery", label: "Delivery" }]}
          currentModule="delivery"
          initiallyOpen={STATES[state].open}
          savedNote={note}
          facts={[
            { key: "stock", label: "Stock", value: "1/1 Ready", opensItems: true },
            {
              key: "logistics", label: "Logistics", value: logistics, editable: true,
              editor: (close) => (
                <>
                  <strong>Assign logistics</strong>
                  <select aria-label="Logistics company" value={company} onChange={(e) => setCompany(e.target.value)}>
                    <option value="">Choose company</option><option>NETS</option><option>AL</option><option>TEOW</option><option>TT</option>
                  </select>
                  <CardEditorButtons onCancel={close} onSave={() => { if (!company) return; setLogistics(company); addEvent("Delivery · Logistics assigned", company); close(); setNote("Saved in this preview only."); }} />
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
                    setNote(`Preview only · Recorded at ${myt()}, ${mytTime()}`);
                  }} />
                </>
              ),
            },
            {
              key: "do", label: "DO", value: "Data not loaded",
              editor: () => (
                <>
                  <strong>Delivery Order</strong>
                  <div className={s.doChecklist} aria-label="Automatic DO conditions">
                    <div><span aria-hidden="true">□</span> Stock ready</div><div><span aria-hidden="true">□</span> Payment cleared</div><div><span aria-hidden="true">□</span> Customer confirmed date</div>
                  </div>
                  <p className={s.note}>DO is created automatically when all three are met.</p>
                </>
              ),
            },
          ]}
          items={
            <table className={s.items}>
              <thead><tr><th>Item</th><th>Qty</th><th>Stock</th></tr></thead>
              <tbody>
                <tr><td>B1201S · King</td><td>1</td><td>1/1 Ready</td></tr>
                <tr><td>Dispose old bed frame</td><td>1</td><td>—</td></tr>
                <tr><td>Dispose old mattress</td><td>2</td><td>—</td></tr>
              </tbody>
            </table>
          }
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
