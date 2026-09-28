/**
 * AN ISSUE TRACKER ACT, FINISHED IN WORKSPACE (§5.10 ruling, Jess 2026-09-27
 * "workspace is stay here to complete all job"; 2026-09-28 "why jump to others
 * page?"). The kit card: title = what to do, second line = why, the owning
 * module's button at the top right; pressing it opens the Issue Tracker's own
 * record-result form INSIDE the card. Nothing navigates away.
 */
import { useState } from "react";
import type { OperationWorkItem } from "@carres/shared";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import { IssueResultInPlace } from "../issue-tracker/issue-result";

export default function WorkIssueCard({ item }: { item: OperationWorkItem }) {
  const [open, setOpen] = useState(false);
  const tone = item.timing.placement === "missed" ? "missed" : item.timing.placement === "on_day" ? "due" : "none";
  return (
    <Block
      title={item.action}
      why={{ text: item.problem, tone }}
      headerSlot={open ? undefined : <Button size="touch" onClick={() => setOpen(true)} data-testid={`work-act-${item.id}`}>Record result</Button>}
    >
      {open ? (
        <div className="pt-3">
          <IssueResultInPlace issueId={item.object.id} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </div>
      ) : null}
    </Block>
  );
}
