/**
 * ⭐ A READ FAILURE HAS THREE FACES, AND A PERMISSION REFUSAL NEVER OFFERS
 * `Try again` — owner ruling 2026-09-26 (Orders MASTER).
 *
 * The Register, the object page, Revisions, History and the Order Route all
 * answer a failed read through the ONE shared translator (`readFailureWords`),
 * drawn with the kit's `EmptyState` and `Button` and nothing else. A transport
 * message never reaches the screen; empty, failed and refused never share a
 * sentence.
 */
import { useNavigate } from "react-router-dom";
import { readFailureWords, type ReadFailureSurface } from "@carres/shared";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";

export default function SalesOrderReadFailure({
  error,
  surface,
  onRetry,
}: {
  error: unknown;
  surface: ReadFailureSurface;
  onRetry?: () => void;
}) {
  const navigate = useNavigate();
  const words = readFailureWords(error, surface);
  /* The Register is where `Back to Sales Orders` leads; it offers no door to itself. */
  const action =
    words.action === "retry" ? (
      <Button variant="neutral" onClick={() => onRetry?.()}>
        Try again
      </Button>
    ) : surface === "sales-orders-register" ? undefined : (
      <Button variant="neutral" onClick={() => navigate("/operation/orders")}>
        Back to Sales Orders
      </Button>
    );
  return (
    <div
      role="alert"
      data-testid="so-read-failure"
      data-face={words.face}
      className="mx-auto w-full max-w-[480px] px-4"
    >
      <EmptyState title={words.title} detail={words.detail ?? undefined} action={action} />
    </div>
  );
}
