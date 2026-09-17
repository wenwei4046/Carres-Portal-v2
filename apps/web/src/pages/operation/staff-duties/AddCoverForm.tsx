import { useState } from "react";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import DutyActionDialog from "./DutyActionDialog";
import { dutyRefusalSentence } from "./staff-duties-model";
import { fmtDate } from "@/lib/fmt-date";
import { useWorkspaceCoverDutyMutation } from "@/lib/queries";
import type { WorkspaceDutiesResponse } from "@/lib/queries";
import type { OpsStaffMember } from "@carres/shared";

/**
 * `Add cover` (workspace/MASTER.md §4.4).
 *
 * One appended, dated Buddy cover. It changes only the ACTING person for
 * open and future actions inside its period: it never rewrites the normal
 * owner, never grants an approval capability the person lacks, never moves a
 * due date and never reattributes a completed act.
 *
 * The normal owner and the resulting period are shown BEFORE confirmation,
 * because a cover is an agreement about two named people and a range of days
 * — a manager should not have to reconstruct it from the fields.
 *
 * The normal owner is not offered as their own cover. Everything else —
 * eligibility for each protected act, overlap, the company date boundary —
 * is the write door's. Its refusal arrives as a CODE and is printed as the
 * governed §4.4.1 sentence; the database's own text never reaches the page.
 */

type Duty = WorkspaceDutiesResponse["duties"][number];

export default function AddCoverForm({
  duty,
  staff,
  open,
  onClose,
  onDone,
}: {
  duty: Duty;
  staff: OpsStaffMember[];
  open: boolean;
  onClose: () => void;
  onDone: (sentence: string) => void;
}) {
  const [actingUserId, setActingUserId] = useState("");
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const cover = useWorkspaceCoverDutyMutation();

  const normalOwner =
    duty.resolution.normal_user_name ?? duty.resolution.normal_user_id ?? "";
  /* A person cannot cover for themselves; the write door refuses it again. */
  const eligible = staff.filter(
    (s) => s.user_id !== duty.resolution.normal_user_id,
  );

  function submit() {
    setRefusal(null);
    if (!duty.resolution.normal_user_id) {
      return setRefusal(
        `${duty.label} has no normal holder for all these dates. Assign the holder first.`,
      );
    }
    if (!actingUserId) return setRefusal("Choose who will cover this duty.");
    if (!startsOn || !endsOn || endsOn < startsOn) {
      return setRefusal("Choose valid cover dates.");
    }
    cover.mutate(
      { dutyKey: duty.key, actingUserId, startsOn, endsOn, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      {
        /* Runs only after invalidation has been awaited, so the page closes
           onto the server's refreshed resolution — the browser never turns a
           cover on by itself. */
        onSuccess: (written) => {
          /* The names the DOOR wrote for these dates: the normal owner on the
             cover's own days can differ from the holder the page shows today. */
          const row = (written ?? {}) as {
            normal_user_name?: string | null;
            acting_user_name?: string | null;
          };
          const acting =
            row.acting_user_name ??
            eligible.find((s) => s.user_id === actingUserId)?.name ??
            actingUserId;
          const normal = row.normal_user_name ?? normalOwner;
          onDone(
            `${acting} covers ${normal} for ${duty.label}, ${fmtDate(startsOn)}–${fmtDate(endsOn)}`,
          );
          onClose();
        },
      },
    );
  }

  return (
    <DutyActionDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add cover"
      dutyLabel={duty.label}
      submitLabel="Add cover"
      submitTestId="cover-submit"
      pending={cover.isPending}
      error={
        refusal ??
        (cover.error
          ? dutyRefusalSentence("cover", cover.error, {
              duty: duty.label,
              name:
                eligible.find((s) => s.user_id === actingUserId)?.name ??
                "This person",
            })
          : null)
      }
      onSubmit={submit}
    >
      {/* Who is being covered FOR — a fact of this act, never a field. */}
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="w-28 shrink-0 text-label text-kit-slate-9">
          Normal owner
        </span>
        <span className="text-body text-kit-slate-12">{normalOwner}</span>
      </div>
      <Select
        id="cover-acting"
        label="Acting person"
        required
        value={actingUserId}
        onValueChange={setActingUserId}
        placeholder="Choose who will cover"
        options={eligible.map((s) => ({
          value: s.user_id,
          label: s.name ?? s.email,
        }))}
      />
      <DatePicker
        id="cover-from"
        label="From"
        required
        value={startsOn}
        onChange={setStartsOn}
      />
      <DatePicker
        id="cover-until"
        label="Until"
        required
        value={endsOn}
        onChange={setEndsOn}
      />
      {startsOn && endsOn ? (
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="w-28 shrink-0 text-label text-kit-slate-9">
            Cover period
          </span>
          <span className="text-body text-kit-slate-12">
            {`${fmtDate(startsOn)} – ${fmtDate(endsOn)}`}
          </span>
        </div>
      ) : null}
      <Input
        id="cover-reason"
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </DutyActionDialog>
  );
}
