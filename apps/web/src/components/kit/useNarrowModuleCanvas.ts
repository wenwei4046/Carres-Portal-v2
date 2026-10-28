import { useEffect, useState } from "react";

/** UI MASTER: contextual panels overlay the canvas below 1100 CSS px. */
export function useNarrowModuleCanvas() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1100);
  useEffect(() => {
    const measure = () => setNarrow(window.innerWidth < 1100);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return narrow;
}
