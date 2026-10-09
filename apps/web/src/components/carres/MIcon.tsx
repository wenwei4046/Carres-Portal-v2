/**
 * MIcon — Material Symbols Rounded, outline, weight 300 (owner-confirmed
 * handoff 2026-10-08, "Design tokens": icons 16–20px). The font is loaded by
 * `index.css`. Decorative by default; give the BUTTON its accessible name.
 *
 * The glyph is drawn by CSS from `data-icon` (index.css), never as text: an
 * icon-only button keeps empty text, and no icon name leaks into search,
 * copy or an export.
 */
export default function MIcon({
  name,
  size = 20,
  className = "",
  fill = false,
}: {
  /** The Material Symbols ligature, e.g. `receipt_long`. */
  name: string;
  size?: 16 | 18 | 20;
  className?: string;
  fill?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-icon={name}
      className={`material-symbols-rounded inline-block shrink-0 select-none overflow-hidden leading-none ${className}`}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 300, 'GRAD' 0, 'opsz' ${size}`,
      }}
    />
  );
}
