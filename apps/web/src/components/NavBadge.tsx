/**
 * NavBadge — sidebar action-count chip (Loo 2026-05-10).
 *
 * Tiny terracotta pill rendered next to a sidebar nav label when the role
 * has pending actions in that section. Hidden when count <= 0 so quiet
 * sections don't render visual noise.
 *
 * Reusable across every role's sidebar; the data source (count) is
 * computed by each role's `use{Role}Badges()` hook.
 */
interface Props {
  count: number;
  /** Aria-label for screen readers. Caller passes the section label so the
   *  spoken text reads "Procurement, 2 pending". */
  label: string;
}

export default function NavBadge({ count, label }: Props) {
  if (count <= 0) return null;
  // Cap at 99+ so a runaway count doesn't break the sidebar width.
  const display = count > 99 ? "99+" : String(count);
  return (
    <span
      data-testid={`nav-badge-${label.toLowerCase().replace(/\s+/g, "-")}`}
      aria-label={`${label}, ${count} pending`}
      className="ml-auto inline-flex items-center justify-center font-semibold"
      style={{
        background: "var(--brand-signature, #D64F20)",
        color: "white",
        fontSize: "9.5px",
        minWidth: 18,
        height: 16,
        padding: "0 5px",
        borderRadius: 8,
        lineHeight: 1,
      }}
    >
      {display}
    </span>
  );
}
