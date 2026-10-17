/**
 * Drawer — the record opened beside the list (UI-KIT §6, card D0.5b).
 *
 * Same object as `Modal`, placed on the right (v4: inset 12px, 400px wide),
 * so it shares `DialogFrame` rather than repeating a backdrop and a focus
 * trap (§6.6).
 *
 * **Why a separate component and not `<Modal place="side">`.** The two answer
 * different questions — a Modal interrupts to ask something, a Drawer opens a
 * RECORD next to the list it came from — and §8.2's list law depends on the
 * difference: *"close the drawer → the table keeps its filter AND its scroll
 * position."* A page choosing placement from a prop can put a record in the
 * middle of the screen; a page choosing a component cannot.
 *
 * **This is the box, not the order drawer.** What goes INSIDE a detail record —
 * identity · current action · current issues · progress · sections · activity —
 * is `DetailShell`, §1.4's ordered slots, and that is **D0.5c**. This component
 * owns the surface and stops there.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import DialogFrame from "./DialogFrame";
import { DialogContainerScope, PanelDialogPresence, useDialogContainer } from "./dialog-container";
import { useNarrowModuleCanvas } from "./useNarrowModuleCanvas";
import { useShellHeader } from "@/pages/operation/components/shell-header-context";

export default function Drawer({
  open,
  onOpenChange,
  title,
  description,
  headerActions,
  variant,
  footer,
  children,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  headerActions?: ReactNode;
  /** Accepted read-only quick-view template. */
  variant?: "quick-view" | "compact-card" | "summary-panel" | "tasks-panel";
  footer?: ReactNode;
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement>;
}) {
  return (
    <DialogFrame
      returnFocusRef={returnFocusRef}
      variant={variant}
      kind="drawer"
      place="side"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      headerActions={headerActions}
      footer={footer}
    >
      {children}
    </DialogFrame>
  );
}

const panelOpeners: Record<"Summary" | "Tasks", { current: HTMLElement | null }> = { Summary: { current: null }, Tasks: { current: null } };
export function rememberPanelOpener(panel: "Summary" | "Tasks", element: HTMLElement) {
  panelOpeners[panel].current = element;
}

/** Moving the portal host preserves local inputs and scroll across breakpoint changes. */
export function ContextualPanelSurface({ children, onHide, panel, open = true }: {
  children: ReactNode;
  onHide?: () => void;
  panel: "Summary" | "Tasks";
  open?: boolean;
}) {
  const inheritedContainer = useDialogContainer();
  const small = useNarrowModuleCanvas();
  const inShell = useShellHeader() != null;
  const wantsNarrow = small && inShell;
  const [narrow, setNarrow] = useState(wantsNarrow);
  const [childDialogs, setChildDialogs] = useState(0);
  const holdSurface = useCallback(() => {
    setChildDialogs((count) => count + 1);
    return () => setChildDialogs((count) => count - 1);
  }, []);
  useLayoutEffect(() => {
    if (childDialogs === 0) setNarrow(wantsNarrow);
  }, [wantsNarrow, childDialogs]);
  const [host] = useState(() => document.createElement("div"));
  const focused = useRef<HTMLElement | null>(null);
  host.className = narrow ? "flex min-h-0 flex-1 flex-col" : "contents";
  const attach = useCallback((node: HTMLDivElement | null) => {
    const active = document.activeElement;
    if (!node) { focused.current = active instanceof HTMLElement && host.contains(active) ? active : null; return; }
    const target = active instanceof HTMLElement && host.contains(active) ? active : focused.current;
    node.appendChild(host);
    focused.current = null;
    if (target && host.contains(target)) target.focus({ preventScroll: true });
  }, [host]);
  const slot = <div ref={attach} className="flex min-h-0 flex-1 flex-col" />;
  return <>
    {narrow && onHide ? <Drawer returnFocusRef={panelOpeners[panel]} variant={panel === "Summary" ? "summary-panel" : "tasks-panel"} open={open} title={panel} onOpenChange={(open) => { if (!open) onHide(); }}>{slot}</Drawer> : open ? <div ref={attach} className="contents" /> : null}
    {createPortal(<PanelDialogPresence.Provider value={holdSurface}><DialogContainerScope container={narrow ? host : inheritedContainer}>{children}</DialogContainerScope></PanelDialogPresence.Provider>, host)}
  </>;
}

export function SummaryPanelSurface({ children, onHide }: { children: ReactNode; onHide?: () => void }) {
  return <ContextualPanelSurface panel="Summary" onHide={onHide}>{children}</ContextualPanelSurface>;
}
