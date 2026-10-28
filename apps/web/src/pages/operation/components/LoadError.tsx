import Button from "@/components/kit/Button";

/** A load failure: what broke, then a real button that fixes it. Never the empty sentence. */
export default function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 p-4 text-body">
      <span>{message}</span>
      <Button variant="neutral" onClick={onRetry}>Try again</Button>
    </div>
  );
}
