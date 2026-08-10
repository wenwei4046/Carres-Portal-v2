import React from "react";
import { StatusPill } from "../core/StatusPill.jsx";
import { Checkbox } from "../core/Checkbox.jsx";

/**
 * ListRow — one order row in the Orders list. Height is FIXED at 44px (v4 §8b):
 * content adapts to the row, the row never grows. Multi-REF collapses to the
 * first ref + "+N". Selected rows get the blue wash. This is the single most
 * important density rule in the whole system.
 */
export function ListRow({ order, selected = false, onToggle }) {
  const { ref, extraRefs = 0, so, customer, region, deadline, weekday, late, stock, next } = order;
  const cell = { padding: "0 12px", verticalAlign: "middle", fontSize: 12, color: "var(--base-800)" };
  return (
    <tr style={{ height: 44, background: selected ? "var(--select-wash)" : "transparent", borderTop: "1px solid rgba(17,24,39,.06)" }}>
      <td style={{ ...cell, width: 34 }}>
        <Checkbox variant="select" checked={selected} onChange={onToggle} />
      </td>
      <td style={cell}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--base-900)" }}>
          {ref}{extraRefs > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: "var(--base-400)" }}> +{extraRefs}</span>}
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--base-400)" }}>{so}</div>
      </td>
      <td style={cell}>{customer}</td>
      <td style={{ ...cell, color: "var(--base-600)" }}>{region}</td>
      <td style={cell}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: late ? "var(--alert-red)" : "var(--base-900)" }}>{deadline}</span>{" "}
        <span style={{ fontSize: 10, color: "var(--base-400)" }}>{late ? "over" : weekday}</span>
      </td>
      <td style={cell}><StatusPill tone={stock.tone} dot>{stock.label}</StatusPill></td>
      <td style={cell}><StatusPill tone={next.tone}>{next.label}</StatusPill></td>
    </tr>
  );
}
