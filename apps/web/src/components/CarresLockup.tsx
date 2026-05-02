interface Props {
  /** Marks the spot for an optional "Portal" suffix the proto shows on the
   *  login page only. Off by default — sidebar lockup uses the bare brand. */
  showPortal?: boolean;
  /** Height of the heart-pulse mark in pixels. Match to surrounding text size. */
  size?: number;
}

/**
 * Brand lockup — heart-pulse mark + "Carres." wordmark in DM Sans bold,
 * terracotta. Mirrors `reference/shared/brand.jsx CarresLockup` so every
 * shell that mounted that proto component (dealer / principal / finance /
 * logistics / partner / bd) renders the same mark in v2.
 */
export default function CarresLockup({ showPortal = false, size = 26 }: Props) {
  return (
    <span className="inline-flex items-center gap-2.5 leading-none">
      <img
        src="/carres-logo.png"
        alt="Carres"
        width={size}
        height={size}
        className="block object-contain"
      />
      <span className="font-display text-[18px] font-semibold tracking-[-0.015em] text-primary">
        Carres<span className="text-primary">.</span>
        {showPortal && (
          <span className="ml-1.5 font-medium text-base-500 text-[13px]">Portal</span>
        )}
      </span>
    </span>
  );
}
