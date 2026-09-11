import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Fit below the first data column, using the actual rendered gutter width. */
export function ViewportExpansion({ children }: {
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const cell = ref.current?.parentElement;
    const table = cell?.closest("table");
    const viewport = table?.parentElement;
    if (!viewport || !cell || !table) return;
    const measure = () => {
      const gutter = cell.getBoundingClientRect().left - table.getBoundingClientRect().left;
      setWidth(Math.max(0, viewport.clientWidth - gutter));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(table);
    observer.observe(cell);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return <div ref={ref} className="w-full min-w-0" style={{ maxWidth: width }}>{children}</div>;
}
