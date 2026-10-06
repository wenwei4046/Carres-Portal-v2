import { useEffect, useState } from "react";
import { ListTodo } from "lucide-react";
import Button from "@/components/kit/Button";
import Drawer from "@/components/kit/Drawer";
import TasksArea from "../../tasks/TasksArea";
import { useTasksHost } from "../../tasks/tasks-host";

/**
 * The phone shell's `Tasks` door (owner direction 2026-10-05). Below 768px there is no Quick Rail, so
 * the door sits beside the phone `Calendar` door and opens the SAME Tasks
 * area full screen: the list, then the task, then `‹ Tasks`. Closing with an
 * unsaved task asks first, as on the desktop.
 */
export default function PhoneTasksDoor() {
  const [open, setOpen] = useState(false);
  const guard = useTasksHost((s) => s.guard);
  /* `View tasks` (the first-entry reminder) opens the same list here. */
  const tasksRequest = useTasksHost((s) => s.tasksRequest);
  useEffect(() => {
    if (tasksRequest > 0) setOpen(true);
  }, [tasksRequest]);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} aria-expanded={open} data-testid="phone-tasks-door">
        <ListTodo size={16} aria-hidden />
        Tasks
      </Button>
      <Drawer variant="compact-card" open={open} onOpenChange={(next) => (next ? setOpen(true) : guard(() => setOpen(false)))} title="Tasks">
        <div className="flex h-full min-h-0 flex-col" data-testid="phone-tasks">
          <TasksArea fill onClose={() => setOpen(false)} />
        </div>
      </Drawer>
    </>
  );
}
