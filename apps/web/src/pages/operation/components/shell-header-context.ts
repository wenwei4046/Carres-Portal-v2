/** The Operations shell header slot (see `ShellHeader.tsx`). Its own file so
 *  `GlobalTopBar` and `ModuleHeader` can read it without an import cycle. */
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ShellHeaderSlot = {
  /** Where a page's `ModuleHeader` portals its identity. */
  el: HTMLElement | null;
  /** A page says "I name myself"; returns the release. */
  claim: () => () => void;
};

export const ShellHeaderContext = createContext<ShellHeaderSlot | null>(null);

/** Inside the Operations shell? Then the header is the shell's to draw. */
export function useShellHeader(): ShellHeaderSlot | null {
  return useContext(ShellHeaderContext);
}

/** The shell's side of the contract: the slot element, the claim count and
 *  the context value to provide. */
export function useShellHeaderHost() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const claim = useCallback(() => {
    setClaims((n) => n + 1);
    return () => setClaims((n) => n - 1);
  }, []);
  const value = useMemo<ShellHeaderSlot>(() => ({ el, claim }), [el, claim]);
  return { value, slotRef: setEl, claimed: claims > 0 };
}

