import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";

/** Failed read on an Admin page: say so and offer a retry, never "No data" or zero. */
export default function ReadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon="late"
        title="Could not be loaded"
        detail={`${what} did not load. Check your connection, then try again.`}
        action={<Button variant="primary" icon="refresh" onClick={onRetry}>Try again</Button>}
      />
    </div>
  );
}
