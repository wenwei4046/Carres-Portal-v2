interface Props {
  /** Marks the spot for an optional "Portal" suffix the proto shows on the
   *  login page only. Off by default — sidebar lockup uses the bare brand. */
  showPortal?: boolean;
  /** Height of the heart-pulse mark in pixels. Match to surrounding text size. */
  size?: number;
}

/**
 * Brand lockup — heart-pulse mark + the official CARRES wordmark image (Jess
 * 2026-06-29: the mark is correct, but the old DM-Sans "Carres." text wordmark
 * was wrong → replaced with the real wordmark asset). Used by every role shell
 * (dealer / principal / finance / operation / partner / bd) + the login page.
 */
export default function CarresLockup({ showPortal = false, size = 26 }: Props) {
  return (
    <span className="inline-flex items-center gap-2.5 leading-none">
      <img
        src="/carres-logo.png"
        alt=""
        width={size}
        height={size}
        className="block object-contain"
      />
      <img
        src="/carres-wordmark.webp"
        alt="Carres"
        className="block object-contain w-auto"
        style={{ height: Math.round(size * 0.62) }}
      />
      {showPortal && (
        <span className="font-medium text-base-500 text-[13px]">Portal</span>
      )}
    </span>
  );
}
