import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useInviteDealer } from "@/lib/queries";
import { TOAST } from "@/lib/toast-copy";

/**
 * Centered modal to invite a new dealer. Mirrors the proto's
 * `InviteDealerModal` (`reference/proto/principal-dealers.jsx` lines
 * 227-254).
 *
 * Validation: all three fields must trim to a few chars (matches the proto
 * "non-empty" rule, with a slightly stricter min-length to dodge accidental
 * single-letter submissions). Server-side `inviteDealerInput` zod will
 * re-validate either way.
 *
 * Idempotency: `useInviteDealer` calls the `dealer_invite` RPC, which
 * returns `idempotent: true` when (name, region) already matches an
 * existing pending dealer. We surface that as an `info` toast instead of
 * `success` so the user knows nothing new was queued.
 */
interface Props {
  onClose: () => void;
}

export default function InviteDealerModal({ onClose }: Props) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [contact, setContact] = useState("");
  const invite = useInviteDealer();
  const valid =
    name.trim().length > 1 &&
    region.trim().length > 1 &&
    contact.trim().length > 2;

  async function submit() {
    if (!valid || invite.isPending) return;
    try {
      const res = await invite.mutateAsync({
        name: name.trim(),
        region: region.trim(),
        contact: contact.trim(),
      });
      if (res.idempotent) {
        toast.info(`${res.dealer.name} already invited (no duplicate created)`);
      } else {
        toast.success(TOAST.inviteSuccess(res.dealer.name));
      }
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        toast.error(e.message || "Failed to invite dealer");
      } else {
        toast.error(e instanceof Error ? e.message : "Failed to invite dealer");
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center">
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 cursor-pointer border-0 p-0"
      />
      <div className="relative w-[440px] p-6 bg-white border border-base-200 rounded-md">
        <div className="kicker">Network</div>
        <div className="font-display text-[20px] mt-1 mb-1.5 font-semibold">
          Invite a new dealer
        </div>
        <div className="text-[12px] text-base-600 mb-[18px]">
          They&apos;ll appear with status <strong>Pending</strong> until approved.
        </div>
        <div className="grid gap-3 mb-[18px]">
          <Field
            label="Business name"
            v={name}
            onChange={setName}
            placeholder="ComfortBeds Sdn Bhd"
          />
          <Field
            label="Region"
            v={region}
            onChange={setRegion}
            placeholder="Klang Valley · Selangor · ..."
          />
          <Field
            label="Contact"
            v={contact}
            onChange={setContact}
            placeholder="Name · phone"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || invite.isPending}
            className="btn-primary disabled:opacity-50"
          >
            {invite.isPending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  v,
  onChange,
  placeholder,
}: {
  label: string;
  v: string;
  onChange: (s: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wider text-base-500 font-semibold mb-1">
        {label}
      </div>
      <input
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-base-200 rounded text-[13px] outline-none box-border"
      />
    </div>
  );
}
