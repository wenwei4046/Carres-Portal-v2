import { useEffect } from "react";

/**
 * F3 or Ctrl+S presses the form's Save.
 * `ready` is false while Save names a gap or a save is already running; then
 * the key does nothing. Ctrl+S never opens the browser's own Save page.
 */
export function useSaveKey(save: () => void, ready: boolean): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrlS = (e.ctrlKey || e.metaKey) && (e.key ?? "").toLowerCase() === "s";
      if (!ctrlS && e.key !== "F3") return;
      e.preventDefault();
      if (ready && !e.repeat) save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, ready]);
}
