import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";

/** A read that failed: never "No data" or a zero, always a way to ask again. */
export default function ReadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" data-testid="read-failed">
      <EmptyState
        title="Could not be loaded"
        detail={`${what} did not arrive. Nothing was changed.`}
        action={<Button variant="neutral" onClick={onRetry}>Try again</Button>}
      />
    </div>
  );
}
