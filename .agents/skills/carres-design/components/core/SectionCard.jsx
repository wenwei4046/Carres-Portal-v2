import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * SectionCard — a white panel on the grey canvas (v4 §9). Header row with a
 * title + optional right-side summary/action; collapses to its one-line
 * summary (the order-detail pattern). 12px radius, hairline border, whisper
 * shadow — all from the tokens.
 */
export function SectionCard({ title, summary, actions, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card" style={{ overflow: "hidden" }}>
      <header
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px", cursor: children ? "pointer" : "default",
        }}
        onClick={() => children && setOpen((v) => !v)}
      >
        {children && (
          <ChevronDown
            size={16}
            style={{ color: "var(--text-muted)", transform: open ? "" : "rotate(-90deg)", transition: "transform .15s" }}
          />
        )}
        <span className="t4-section" style={{ flex: 1 }}>{title}</span>
        {summary && <span className="t4-caption">{summary}</span>}
        {actions}
      </header>
      {open && children && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--hairline)" }}>{children}</div>
      )}
    </section>
  );
}
