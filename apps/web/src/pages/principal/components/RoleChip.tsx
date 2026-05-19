/**
 * Compact role pill used in the Recent Activity tile to colour-code who took
 * the action. Mirrors `principal-dashboard.jsx` lines 259-270. Background is
 * always base-100; the role colour applies to the text only so the chip stays
 * readable on the warm-linen card surface.
 *
 * Unknown roles fall back to base-500 (neutral) so a future system role
 * won't crash the tile.
 */
const ROLE_TEXT: Record<string, string> = {
  dealer: "text-[#3c5a78]",
  operation: "text-[#8b5e3c]",
  finance: "text-success",
  supplier: "text-[#7a3f86]",
  principal: "text-primary",
  showroom: "text-[#3c5a78]",
  bd: "text-base-700",
  system: "text-base-500",
};

interface Props {
  role: string;
}

export default function RoleChip({ role }: Props) {
  const cls = ROLE_TEXT[role] ?? "text-base-500";
  return (
    <span
      className={`px-[7px] py-px bg-base-100 rounded text-[9.5px] font-bold uppercase tracking-wider ${cls}`}
    >
      {role}
    </span>
  );
}
