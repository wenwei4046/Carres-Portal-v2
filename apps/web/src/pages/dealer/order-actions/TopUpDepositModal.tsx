import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useTopUpOrder } from "@/lib/queries";
import { newWizardSessionId, uploadAttachment } from "@/lib/storage";

/**
 * Minimal shape the modal needs. Dealer side passes a full `Order`; operation
 * side passes a slim adapter from `operationOrderDetailOrder`. Structural
 * typing — Order already satisfies these fields, no change needed dealer-side.
 */
export interface TopUpTarget {
  id: string;
  dl: number;
  dealerId: string;
  paid: number;
}

interface Props {
  order: TopUpTarget;
  /** Server-computed total (line + addon, no stair) — same as proceed gating. */
  total: number;
  onClose: () => void;
}

const METHODS: Array<{ key: "cash" | "bank" | "cheque" | "online" | "card"; label: string }> = [
  { key: "cash", label: "Cash" },
  { key: "bank", label: "Bank transfer" },
  { key: "cheque", label: "Cheque" },
  { key: "online", label: "Online (FPX/eWallet)" },
  { key: "card", label: "Card / terminal" },
];

const RM = (n: number) =>
  `RM ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface PhotoSlot {
  /** Local preview only — converted to a Blob + uploaded on Submit. */
  file: File;
  dataUrl: string;
}

/**
 * TopUpDepositModal — proto/dealer-action-modals.jsx:17-231 parity. Lets a
 * dealer record an additional partial payment toward an open order's total
 * (cash / bank / cheque / online / card). Photos uploaded to Storage on
 * submit; the path list is sent to `top_up_order` RPC and persisted in
 * `order_history.metadata.photo_paths`.
 */
export default function TopUpDepositModal({ order, total, onClose }: Props) {
  // 2026-05-13 (Loo) — derive dealer scope from the order, not the caller's
  // JWT. Lets operation / finance / principal record top-ups on dealer-owned
  // orders without needing a dealer JWT claim. Storage paths still nest under
  // the order's dealer folder so RLS on orders-attachments stays scoped.
  const dealerId = order.dealerId;
  const paid = order.paid;
  const balanceTo50 = Math.max(0, Math.ceil(total * 0.5) - paid);
  const balanceToFull = Math.max(0, total - paid);
  const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;

  // Default the preset to whichever still has balance — proto behavior.
  const initialPresetKey: "fifty" | "full" | "custom" =
    balanceTo50 > 0 ? "fifty" : balanceToFull > 0 ? "full" : "custom";
  const initialAmount = balanceTo50 > 0 ? balanceTo50 : balanceToFull;

  const [presetKey, setPresetKey] = useState(initialPresetKey);
  const [amount, setAmount] = useState<number>(initialAmount);
  const [method, setMethod] = useState<(typeof METHODS)[number]["key"]>("bank");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [uploading, setUploading] = useState(false);

  const newPaid = useMemo(() => Math.min(total, paid + (amount || 0)), [paid, amount, total]);
  const newPct = total > 0 ? Math.round((newPaid / total) * 100) : 0;
  const willCross50 = paidPct < 50 && newPct >= 50;
  const overBalance = amount > balanceToFull;

  const topUpMut = useTopUpOrder(order.id, {
    onSuccess: () => {
      toast.success(`Recorded ${RM(amount)} for #${order.dl}`);
      onClose();
    },
    onError: (err) => {
      // 422 with code=already_paid / wrong_status — show specific copy.
      if (err instanceof ApiError && err.status === 422) {
        const code = (err.body as { code?: unknown } | null)?.code;
        if (code === "already_paid") {
          toast.error("Already fully paid");
          return;
        }
        if (code === "wrong_status") {
          toast.error("Order is no longer in Place — refresh and retry");
          return;
        }
      }
      toast.error(err.message || "Could not record payment");
    },
  });

  function pickPreset(key: "fifty" | "full" | "custom") {
    setPresetKey(key);
    if (key === "fifty") setAmount(balanceTo50);
    if (key === "full") setAmount(balanceToFull);
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const slots = Math.max(0, 4 - photos.length);
    const taken = Array.from(files).slice(0, slots);
    taken.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = String(ev.target?.result ?? "");
        setPhotos((ps) => [...ps, { file: f, dataUrl }]);
      };
      reader.readAsDataURL(f);
    });
  }

  function removePhoto(idx: number) {
    setPhotos((ps) => ps.filter((_, i) => i !== idx));
  }

  const canSubmit =
    amount > 0 &&
    amount <= balanceToFull &&
    photos.length > 0 &&
    !uploading &&
    !topUpMut.isPending &&
    !!dealerId;

  async function handleSubmit() {
    if (!canSubmit || !dealerId) return;
    try {
      setUploading(true);
      // One session UUID per top-up event keeps receipt photos grouped under
      // a single Storage folder. Same convention as wizard sessions.
      const sessionId = newWizardSessionId();
      const photoPaths = await Promise.all(
        photos.map((p, i) => {
          const ext = extensionFromMime(p.file.type) ?? "jpg";
          return uploadAttachment({
            dealerId,
            wizardSessionId: `topup-${sessionId}`,
            filename: `receipt-${i + 1}.${ext}`,
            blob: p.file,
          });
        }),
      );
      setUploading(false);

      const methodLabel = METHODS.find((m) => m.key === method)?.label ?? method;
      topUpMut.mutate({
        amount,
        method,
        methodLabel,
        reference: reference.trim() || null,
        note: note.trim() || null,
        date,
        photoPaths,
      });
    } catch (err) {
      setUploading(false);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  const presets = [
    {
      key: "fifty" as const,
      label: "Top up to 50%",
      sub: balanceTo50 > 0 ? RM(balanceTo50) : "Already covered",
      disabled: balanceTo50 === 0,
    },
    {
      key: "full" as const,
      label: "Pay in full",
      sub: balanceToFull > 0 ? RM(balanceToFull) : "Already covered",
      disabled: balanceToFull === 0,
    },
    { key: "custom" as const, label: "Custom", sub: "Type below", disabled: false },
  ];

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <header className="px-7 pt-5 pb-3.5 border-b border-base-100">
        <p className="kicker">Record payment · #{order.dl}</p>
        <h2 className="font-display text-[22px] mt-0.5 tracking-[-0.02em] leading-[1.2] font-semibold">
          Top up deposit
        </h2>
        <p className="text-xs text-base-600 mt-1">
          Currently <strong className="font-mono">{RM(paid)}</strong> of{" "}
          <strong className="font-mono">{RM(total)}</strong> paid ·{" "}
          <span className={paidPct >= 50 ? "text-success" : "text-warning"}>{paidPct}%</span>
        </p>
      </header>

      {/* Body */}
      <div className="px-7 py-6 overflow-auto flex-1 flex flex-col gap-5">
        {/* Amount */}
        <section>
          <label className="label block mb-2">Amount received *</label>
          <div className="grid grid-cols-3 gap-2 mb-2.5">
            {presets.map((p) => {
              const active = presetKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={p.disabled}
                  onClick={() => !p.disabled && pickPreset(p.key)}
                  className={`px-3 py-3 rounded border-[1.5px] text-center transition-colors ${
                    p.disabled
                      ? "border-base-200 bg-base-50 opacity-40 cursor-not-allowed"
                      : active
                        ? "border-primary bg-signature-50"
                        : "border-base-200 bg-white hover:border-primary/40"
                  }`}
                >
                  <div className="text-[12px] font-semibold">{p.label}</div>
                  <div className="font-mono text-[11px] text-base-500 mt-0.5">{p.sub}</div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[13px] text-base-500">RM</span>
            <input
              type="number"
              value={amount || ""}
              placeholder="Amount"
              min={0}
              max={balanceToFull}
              onChange={(e) => {
                setPresetKey("custom");
                setAmount(Math.min(balanceToFull, Math.max(0, parseFloat(e.target.value) || 0)));
              }}
              className="flex-1 px-3 py-2.5 border border-base-300 rounded font-mono text-sm bg-white outline-none focus:border-primary"
            />
            <span
              className={`text-xs whitespace-nowrap ${newPct >= 50 ? "text-success" : "text-warning"}`}
            >
              → {newPct}% paid
            </span>
          </div>
          {amount > 0 && willCross50 && (
            <div className="mt-2.5 px-3 py-2 rounded border border-success bg-success-soft text-xs text-base-800">
              ✓ This payment will bring the order to ≥ 50% — eligible to{" "}
              <strong>Proceed</strong> after submit.
            </div>
          )}
          {overBalance && (
            <div className="mt-2.5 px-3 py-2 rounded border border-warning bg-warning-soft text-xs text-base-800">
              Amount exceeds balance ({RM(balanceToFull)}). It will be capped at submit.
            </div>
          )}
        </section>

        {/* Method + Date + Reference */}
        <section>
          <label className="label block mb-2">Payment method *</label>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {METHODS.map((m) => {
              const active = method === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethod(m.key)}
                  className={`px-2.5 py-2 rounded border-[1.5px] text-center text-xs transition-colors ${
                    active
                      ? "border-primary bg-signature-50 text-base-900 font-semibold"
                      : "border-base-200 bg-white text-base-700 hover:border-primary/40"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label block mb-1.5">Date received</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-base-300 rounded text-sm bg-white outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="label block mb-1.5">Reference #</span>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={
                  method === "cheque"
                    ? "Cheque number"
                    : method === "cash"
                      ? "—"
                      : "Txn ID / last 4 digits"
                }
                className="w-full px-3 py-2.5 border border-base-300 rounded text-sm bg-white outline-none focus:border-primary"
              />
            </label>
          </div>
        </section>

        {/* Photos */}
        <section>
          <label className="label block mb-2">
            Receipt / bank slip *{" "}
            <span className="text-base-400 font-medium normal-case tracking-normal">
              (at least 1, up to 4)
            </span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div
                key={i}
                className="relative aspect-square rounded border border-base-200 bg-white overflow-hidden"
              >
                <img src={p.dataUrl} alt={p.file.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 w-[22px] h-[22px] rounded-full bg-base-900/75 text-white text-[13px] grid place-items-center"
                  aria-label="Remove photo"
                >
                  ×
                </button>
                <div className="absolute left-0 right-0 bottom-0 px-1.5 py-0.5 bg-white/90 text-[9px] font-mono text-base-700 truncate">
                  {p.file.name}
                </div>
              </div>
            ))}
            {photos.length < 4 && (
              <label
                className={`aspect-square rounded grid place-items-center cursor-pointer text-center px-2 ${
                  photos.length === 0
                    ? "border-[1.5px] border-dashed border-warning bg-warning-soft text-warning"
                    : "border-[1.5px] border-dashed border-base-300 bg-base-50 text-base-600 hover:border-primary/40"
                }`}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/heic,image/heif"
                  multiple
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div>
                  <div className="text-[22px] leading-none mb-1">+</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em]">
                    Attach photo
                  </div>
                  <div className="text-[9px] text-base-500 mt-0.5">Camera / file</div>
                </div>
              </label>
            )}
          </div>
        </section>

        {/* Note */}
        <section>
          <label className="label block mb-2">
            Note <span className="text-base-400 font-medium normal-case tracking-normal">(optional)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Customer paid via Maybank2u to company account"
            rows={2}
            className="w-full px-3 py-2.5 border border-base-300 rounded text-sm bg-white outline-none focus:border-primary resize-vertical"
          />
        </section>
      </div>

      {/* Footer */}
      <footer className="px-7 py-3.5 border-t border-base-100 bg-base-50 flex justify-between items-center gap-4">
        <p className="text-[11px] text-base-600">
          {photos.length === 0 ? (
            <span className="text-warning">⚠ Attach a receipt photo to confirm</span>
          ) : (
            <span>
              Will record <strong className="font-mono">{RM(amount)}</strong> via{" "}
              <strong>{METHODS.find((m) => m.key === method)?.label}</strong>
            </span>
          )}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="btn-primary"
          >
            {uploading ? "Uploading…" : topUpMut.isPending ? "Submitting…" : "Submit payment"}
          </button>
        </div>
      </footer>
    </ModalShell>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Shared modal chrome — proto-style backdrop + 620px card with the full
 *  three-row layout (header + scrollable body + footer). All three action
 *  modals (TopUp / Date / Address) reuse this shell. */
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-base-900/55 grid place-items-center z-[60] p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[620px] max-h-[92vh] flex flex-col bg-card text-card-foreground rounded-md shadow-md border border-base-900/10"
      >
        {children}
      </div>
    </div>
  );
}

function extensionFromMime(mime: string): string | null {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return null;
}

export { ModalShell };
