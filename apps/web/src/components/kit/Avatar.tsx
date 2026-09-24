/**
 * Avatar — one governed staff identity chip.
 *
 * Primitive exemption: an Avatar has no loading or empty state. Callers omit
 * it when no person exists and render the governed unresolved-owner words.
 */
import Tooltip from "./Tooltip";
import { avatarColor, personInitials } from "@/lib/staff-avatar";

export interface AvatarProps {
  userId: string;
  name: string;
  email?: string;
  size?: "sm" | "md";
}

const SIZE = {
  sm: "h-6 w-6 text-label",
  md: "h-8 w-8 text-label",
} as const;

export default function Avatar({ userId, name, email = "", size = "sm" }: AvatarProps) {
  const colour = avatarColor(userId);
  return (
    <Tooltip content={name}>
      <span
        tabIndex={0}
        role="img"
        aria-label={name}
        data-kit="avatar"
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9 focus-visible:ring-offset-1 ${SIZE[size]}`}
        style={{ backgroundColor: colour.bg, color: colour.fg }}
      >
        {personInitials(name, email)}
      </span>
    </Tooltip>
  );
}
