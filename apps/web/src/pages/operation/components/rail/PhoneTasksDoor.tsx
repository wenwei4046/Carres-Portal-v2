import { useState } from "react";
import { ArrowLeft, ListTodo } from "lucide-react";
import Button from "@/components/kit/Button";
import Drawer from "@/components/kit/Drawer";
import { useCurrentPageWork } from "@/components/working-panel/page-work";
import PageWorkPanel, { WORKING_PANEL_WORDS } from "./PageWorkPanel";
import TasksPanel from "./TasksPanel";

/**
 * The phone shell's `Tasks` door — LOCALHOST PROPOSAL (owner flow 2026-10-05).
 *
 * Below 768px there is no Quick Rail, so the door sits beside the existing
 * phone `Calendar` door, in the same form. It opens the SAME right-area grammar
 * in a Drawer: the page's own work first (when the page offers work), with the
 * global Tasks one tap away and `Back to {page}` to return. It never opens by
 * itself on a phone — a sheet over the list on entry would hide the records.
 * The Drawer body stays mounted while closed, so a draft survives.
 */
export default function PhoneTasksDoor() {
  const page = useCurrentPageWork();
  const [open, setOpen] = useState(false);
  const [global, setGlobal] = useState(false);
  const showPage = Boolean(page) && !global;
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} aria-expanded={open} data-testid="phone-tasks-door">
        <ListTodo size={16} aria-hidden />
        Tasks
      </Button>
      <Drawer open={open} onOpenChange={setOpen} title={showPage && page ? page.pageName : "Tasks"}>
        {page && global ? (
          <button type="button" onClick={() => setGlobal(false)} data-testid="phone-back-to-page-work"
            className="mb-3 flex items-center gap-1.5 text-meta font-medium text-kit-blue-11">
            <ArrowLeft size={14} aria-hidden />
            {WORKING_PANEL_WORDS.backTo(page.pageName)}
          </button>
        ) : null}
        {page ? (
          <div hidden={!showPage}>
            <PageWorkPanel key={page.pageKey} source={page} onClose={() => setOpen(false)} />
            <button type="button" onClick={() => setGlobal(true)} data-testid="phone-open-tasks"
              className="mt-3 flex items-center gap-1.5 text-meta font-medium text-kit-blue-11">
              <ListTodo size={14} aria-hidden />
              Tasks
            </button>
          </div>
        ) : null}
        <div hidden={showPage}>
          <TasksPanel />
        </div>
      </Drawer>
    </>
  );
}
