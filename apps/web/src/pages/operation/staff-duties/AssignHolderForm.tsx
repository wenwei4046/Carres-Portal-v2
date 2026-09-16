import { useState } from "react";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import DutyActionDialog from "./DutyActionDialog";
import { fmtDate } from "@/lib/fmt-date";
import { useWorkspaceAssignDutyMutation } from "@/lib/queries";
import type { WorkspaceDutiesResponse } from "@/lib/queries";
import type { OpsStaffMember } from "@carres/shared";

/**
 * `Assign holder` (workspace/MASTER.md §4.3).
 *
 * One appended assignment — never an edit, never a delete. The form guides
 * early with the exact §4.4.1 sentences, then the SQL door rechecks every
 * fact: eligibility, overlap and the correction law are the server's, and a
 * refusal it returns is printed in its own words.
 *
 * The holder list is whatever `/api/operation/staff?duty=` returned for THIS
 * duty. No name is written here: a duty the catalogue scopes to a role gets
 * that role's accounts, and the write door refuses anyone it should.
 *
 * `Effective from` starts EMPTY on purpose. Defaulting a recorded business
 * date to today is a decision nobody made, and it would make
 * `Choose when this holder starts.` unreachable.
 */

type Duty = WorkspaceDutiesResponse["duties"][number];

export default function AssignHolderForm({
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
  /** The governed success sentence, handed up to be announced. */
  onDone: (sentence: string) => void;
}) {
  const [holderId, setHolderId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState<string | null>(null);
  const [effectiveUntil, setEffectiveUntil] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const assign = useWorkspaceAssignDutyMutation();

  function submit() {
    setRefusal(null);
    if (!holderId) return setRefusal("Choose a holder.");
    if (!effectiveFrom) return setRefusal("Choose when this holder starts.");
    if (effectiveUntil && effectiveUntil < effectiveFrom) {
      return setRefusal("Until must be on or after Effective from.");
    }
    assign.mutate(
      {
        dutyKey: duty.key,
        holderId,
        effectiveFrom,
        ...(effectiveUntil ? { effectiveUntil } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      {
        /* react-query runs this only after the hook's own onSuccess has
           awaited invalidation — so the page closes onto a REFRESHED read,
           never onto a stale one it would have to correct a moment later. */
        onSuccess: () => {
          const name =
            staff.find((s) => s.user_id === holderId)?.name ?? holderId;
          onDone(`${name} holds ${duty.label} from ${fmtDate(effectiveFrom)}`);
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
      title="Assign holder"
      dutyLabel={duty.label}
      submitLabel="Assign holder"
      submitTestId="assign-submit"
      pending={assign.isPending}
      /* The browser's guiding sentence, else the server's own refusal. */
      error={refusal ?? assign.error?.message ?? null}
      onSubmit={submit}
    >
      <Select
        id="assign-holder"
        label="Holder"
        required
        value={holderId}
        onValueChange={setHolderId}
        placeholder="Choose a holder"
        options={staff.map((s) => ({
          value: s.user_id,
          label: s.name ?? s.email,
        }))}
      />
      <DatePicker
        id="assign-effective-from"
        label="Effective from"
        required
        value={effectiveFrom}
        onChange={setEffectiveFrom}
      />
      <DatePicker
        id="assign-effective-until"
        label="Until"
        value={effectiveUntil}
        onChange={setEffectiveUntil}
      />
      <Input
        id="assign-note"
        label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </DutyActionDialog>
  );
}
