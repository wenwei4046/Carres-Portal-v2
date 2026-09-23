import type { ReactNode } from "react";

export type WorkLayout = "three" | "two" | "one";
export type WorkPanel = "rail" | "list" | "detail";

export default function WorkSplitShell({
  layout,
  activePanel = "list",
  rail,
  list,
  detail,
  className = "",
}: {
  layout: WorkLayout;
  activePanel?: WorkPanel;
  rail: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  className?: string;
}) {
  if (layout === "one") {
    const content = activePanel === "rail" ? rail : activePanel === "detail" ? detail : list;
    const label = activePanel === "rail" ? "Work filters" : activePanel === "detail" ? "Selected work" : "Work actions";
    return <section data-testid="work-split-shell" data-layout="one" aria-label={label} className={`min-h-0 min-w-0 flex-1 overflow-y-auto bg-white ${className}`}>{content}</section>;
  }

  return (
    <div data-testid="work-split-shell" data-layout={layout} className={`flex min-h-0 min-w-0 flex-1 overflow-hidden bg-white ${className}`}>
      <div className="w-60 shrink-0 overflow-hidden">
        {rail}
      </div>
      {layout === "two" ? (
        <section aria-label={activePanel === "detail" ? "Selected work" : "Work actions"} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {activePanel === "detail" ? detail : list}
        </section>
      ) : (
        <>
          <section aria-label="Work actions" className="w-[360px] shrink-0 overflow-y-auto border-r border-kit-slate-5">
            {list}
          </section>
          <section aria-label="Selected work" className="min-h-0 min-w-[500px] flex-1 overflow-y-auto">
            {detail}
          </section>
        </>
      )}
    </div>
  );
}
