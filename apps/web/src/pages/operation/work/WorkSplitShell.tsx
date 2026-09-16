import type { ReactNode } from "react";

export type WorkLayout = "three" | "two" | "one";
export type WorkPanel = "rail" | "list" | "detail";

export default function WorkSplitShell({
  layout,
  activePanel = "list",
  rail,
  list,
  detail,
}: {
  layout: WorkLayout;
  activePanel?: WorkPanel;
  rail: ReactNode;
  list: ReactNode;
  detail: ReactNode;
}) {
  if (layout === "one") {
    const content = activePanel === "rail" ? rail : activePanel === "detail" ? detail : list;
    const label = activePanel === "rail" ? "Work filters" : activePanel === "detail" ? "Selected work" : "Work actions";
    return <section data-testid="work-split-shell" data-layout="one" aria-label={label} className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-white">{content}</section>;
  }

  return (
    <div data-testid="work-split-shell" data-layout={layout} className="flex min-h-0 min-w-0 flex-1 overflow-hidden border border-kit-slate-5 bg-white">
      {layout === "three" ? (
        <aside aria-label="Work filters" className="w-60 shrink-0 overflow-y-auto border-r border-kit-slate-5">
          {rail}
        </aside>
      ) : null}
      <section
        aria-label="Work actions"
        className={`${layout === "three" ? "w-[360px]" : "w-[340px] min-w-[320px]"} shrink-0 overflow-y-auto border-r border-kit-slate-5`}
      >
        {list}
      </section>
      <section aria-label="Selected work" className={`${layout === "three" ? "min-w-[500px]" : "min-w-[420px]"} min-h-0 flex-1 overflow-y-auto`}>
        {detail}
      </section>
    </div>
  );
}
