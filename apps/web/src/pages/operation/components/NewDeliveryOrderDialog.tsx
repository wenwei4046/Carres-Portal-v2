/**
 * NEW DELIVERY ORDER — office staff open a DO from a Sales Order's lines.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23),
 * the Houzs way (`DeliveryOrderFromSo.tsx`) rebuilt in the Carres kit. It
 * overturns Jess's "the system issues every DO" rule; Jess was not part of it.
 *
 * The office picks DELIVERY GROUPS (the DO engine's unit of goods: a bed set
 * never splits), and sees each group's lines. Lines already on a live DO are
 * not offered (`GET /offer/:so`). Create goes through the one issuing path,
 * so the goods, money and Finance gates still decide.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deliveryGroupDef, salesOrderNumberWord, type DeliveryGroupKey } from "@carres/shared";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Checkbox from "@/components/kit/Checkbox";
import { ApiError, apiFetch } from "@/lib/api";
import { DOR_COPY } from "../delivery-orders-register";

type OfferLine = { id: string; sku: string; qty: number; group: DeliveryGroupKey | null };
type Offer = {
  order: { id: string; so: number; customer_name: string | null };
  offer: { groups: DeliveryGroupKey[]; whole: boolean; journey: boolean };
  lines: OfferLine[];
};

const errorOf = (e: unknown) =>
  e instanceof ApiError
    ? (((e.body as { message?: string } | null)?.message ?? e.message) || DOR_COPY.soNotFound)
    : String(e);

export default function NewDeliveryOrderDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [so, setSo] = useState("");
  const [found, setFound] = useState<Offer | null>(null);
  const [picked, setPicked] = useState<DeliveryGroupKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (next: boolean) => {
    setOpen(next);
    setSo("");
    setFound(null);
    setPicked([]);
    setError(null);
  };

  const find = async () => {
    setBusy(true);
    setError(null);
    setFound(null);
    setPicked([]);
    try {
      setFound(await apiFetch<Offer>(`/api/operation/delivery-orders/offer/${encodeURIComponent(so.trim())}`));
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      const { doNumber } = await apiFetch<{ doNumber: string }>("/api/operation/delivery-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: found.order.id, groups: picked }),
      });
      toast.success(DOR_COPY.created(doNumber));
      await qc.invalidateQueries({ queryKey: ["operation", "delivery-orders"] });
      reset(false);
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const others = found?.lines.filter((l) => !l.group) ?? [];
  // An accessories-only order has no group to tick: it goes whole.
  const canCreate = !!found && (picked.length > 0 || (found.offer.whole && found.offer.groups.length === 0 && others.length > 0));
  const lineText = (l: OfferLine) => `${l.sku} · ${DOR_COPY.qty} ${l.qty}`;

  return (
    <>
      <Button variant="primary" size="sm" icon="add" onClick={() => reset(true)}>
        {DOR_COPY.newDo}
      </Button>
      <Modal
        open={open}
        onOpenChange={reset}
        title={DOR_COPY.newDo}
        description={DOR_COPY.newDoHelp}
        width="wide"
        footer={
          <>
            <Button variant="neutral" onClick={() => reset(false)}>
              {DOR_COPY.cancel}
            </Button>
            <Button variant="primary" disabled={!canCreate || busy} loading={busy && !!found} onClick={create}>
              {DOR_COPY.createDo}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (so.trim()) void find();
            }}
          >
            <Input id="new-do-so" label={DOR_COPY.soNo} value={so} onChange={(e) => setSo(e.target.value)} autoFocus />
            <Button type="submit" variant="neutral" disabled={!so.trim() || busy}>
              {DOR_COPY.find}
            </Button>
          </form>
          {error ? (
            <p role="alert" className="text-kit-red-11">
              {error}
            </p>
          ) : null}
          {found ? (
            <div className="flex flex-col gap-3">
              <p className="text-kit-slate-12">
                {salesOrderNumberWord(found.order.so)}
                {found.order.customer_name ? ` · ${found.order.customer_name}` : ""}
              </p>
              {found.offer.journey ? (
                <p className="text-kit-slate-11">{DOR_COPY.journeyOrder}</p>
              ) : found.lines.length === 0 ? (
                <p className="text-kit-slate-11">{DOR_COPY.nothingLeft}</p>
              ) : (
                <>
                  {found.offer.groups.map((g) => (
                    <div key={g} className="flex flex-col gap-1">
                      <Checkbox
                        id={`new-do-group-${g}`}
                        label={deliveryGroupDef(g).label}
                        checked={picked.includes(g)}
                        onCheckedChange={(on) =>
                          setPicked((cur) => (on ? [...cur, g] : cur.filter((x) => x !== g)))
                        }
                      />
                      <ul className="pl-6 text-kit-slate-11">
                        {found.lines
                          .filter((l) => l.group === g)
                          .map((l) => (
                            <li key={l.id}>{lineText(l)}</li>
                          ))}
                      </ul>
                    </div>
                  ))}
                  {others.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-kit-slate-12">{DOR_COPY.otherItems}</p>
                      <p className="text-kit-slate-11">{DOR_COPY.otherItemsHelp}</p>
                      <ul className="pl-6 text-kit-slate-11">
                        {others.map((l) => (
                          <li key={l.id}>{lineText(l)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
