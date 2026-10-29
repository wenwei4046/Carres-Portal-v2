import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { buildInfo, shortCommit } from "@/lib/build-info";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";

/**
 * Report a problem to IT. The request goes to the Houzs IT Hub through
 * POST /api/it-support/tickets (the Hub key stays on the Worker). The screen
 * address and the portal version are stamped here so IT can find the exact
 * page and build; who is asking is read from the session on the server.
 */

const URGENCY = [
  { value: "low", label: "Can wait" },
  { value: "medium", label: "Soon" },
  { value: "high", label: "Blocking my work" },
] as const;

type Sent = { code?: string };

export default function ReportProblemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [code, setCode] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(undefined);
    try {
      const sent = await apiFetch<Sent>("/api/it-support/tickets", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          page_url: window.location.href,
          app_version: shortCommit(buildInfo.commit),
        }),
      });
      setCode(sent.code ?? "");
    } catch (e) {
      setError((e as Error).message || "Could not send. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setCode(null);
    setError(undefined);
    onClose();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o && !busy) close(); }}
      title="Report a problem to IT"
      description={code !== null ? undefined : "Say what went wrong. IT will see the page you are on."}
      footer={
        code !== null ? (
          <Button variant="primary" onClick={close}>Done</Button>
        ) : (
          <>
            <Button onClick={close} disabled={busy}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!title.trim()}
              onClick={() => void send()}
              data-testid="report-problem-send"
            >
              Send to IT
            </Button>
          </>
        )
      }
    >
      {code !== null ? (
        <p data-testid="report-problem-sent" className="text-body text-base-800">
          Sent to IT.{code ? ` Your request number is ${code}.` : ""}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <Input
            id="report-problem-title"
            label="What went wrong?"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            id="report-problem-description"
            label="Tell IT more"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Select
            id="report-problem-urgency"
            label="How urgent is it?"
            value={priority}
            onValueChange={setPriority}
            options={URGENCY}
          />
          {error ? <p role="alert" className="text-meta text-red-600">{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}
