import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";

/** A failed read says so and offers Try again; it never shows "No data" or a zero (MASTER §2.2). */
export default function CouldNotLoad({ detail, onRetry }: { detail?: string; onRetry: () => void }) {
  return (
    <div role="alert" data-testid="could-not-load">
      <EmptyState
        title="Could not be loaded"
        detail={detail}
        action={<Button variant="neutral" onClick={onRetry}>Try again</Button>}
      />
    </div>
  );
}
