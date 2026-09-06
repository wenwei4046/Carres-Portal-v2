import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PAYMENT_TEMPLATE_PURPOSES,
  PAYMENT_TEMPLATE_PURPOSE_WORD,
  renderPaymentTemplate,
  type PaymentTemplatePurpose,
  type PaymentTemplateRow,
} from "@carres/shared/payment-templates";
import { apiFetch } from "@/lib/api";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import { fmtDate } from "@/lib/fmt-date";
import { toast } from "sonner";

/**
 * Settings → Payment → WhatsApp templates (payment/MASTER.md §16 · 0435).
 *
 * Multiple named Active templates per governed purpose, ONE Default per
 * purpose. The editor is the governed 50/50 Edit composition: ordinary
 * wording on the left, the real message preview on the right, protected
 * merge fields, and Review changes before Save. Saved versions are
 * immutable history; a purpose with no owner-approved wording says so —
 * nothing here invents customer copy.
 */
const KNOWN_FIELDS = ["customer", "ref", "outstanding", "items"] as const;
const SAMPLE_FACTS: Record<string, string> = {
  customer: "LIM KUAN YANG",
  ref: "CR12345",
  outstanding: "2,200",
  items: "1× King Mattress",
};
/** The money-ask purposes must keep their amount field. */
const REQUIRED_FIELDS: Partial<Record<PaymentTemplatePurpose, string[]>> = {
  gentle_reminder: ["outstanding"],
  should_have_been_received: ["outstanding"],
  standard_bank_transfer: ["outstanding"],
  customer_promised: ["outstanding"],
};

function fieldProblems(purpose: PaymentTemplatePurpose, body: string): string[] {
  const problems: string[] = [];
  for (const match of body.matchAll(/\{([a-z_]+)\}/g)) {
    if (!KNOWN_FIELDS.includes(match[1] as (typeof KNOWN_FIELDS)[number])) {
      problems.push(`The field {${match[1]}} is not a known field.`);
    }
  }
  for (const required of REQUIRED_FIELDS[purpose] ?? []) {
    if (!body.includes(`{${required}}`)) {
      problems.push(`Keep the {${required}} field. The message must say the amount.`);
    }
  }
  return [...new Set(problems)];
}

interface EditorState {
  templateKey: string | null;
  purpose: PaymentTemplatePurpose;
  name: string;
  body: string;
  /** What the head said before this edit — shown by Review changes. */
  before: PaymentTemplateRow | null;
}

export default function PaymentTemplateLibrary() {
  const qc = useQueryClient();
  const query = useQuery<{ templates: PaymentTemplateRow[] }>({
    queryKey: ["finance", "payment-templates"],
    queryFn: () => apiFetch("/api/finance/payment-settings/templates"),
  });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["finance", "payment-templates"] });
  const save = useMutation({
    mutationFn: (input: { templateKey: string | null; purpose: string; name: string; body: string }) =>
      apiFetch("/api/finance/payment-settings/templates/save", {
        method: "POST", body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success("Template saved");
      setEditor(null);
      setReviewing(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setDefault = useMutation({
    mutationFn: (templateKey: string) =>
      apiFetch("/api/finance/payment-settings/templates/set-default", {
        method: "POST", body: JSON.stringify({ templateKey }),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const setActive = useMutation({
    mutationFn: (input: { templateKey: string; active: boolean }) =>
      apiFetch("/api/finance/payment-settings/templates/set-active", {
        method: "POST", body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = query.data?.templates ?? [];
  const heads = useMemo(() => rows.filter((t) => t.is_head), [rows]);
  const versionsOf = (key: string) =>
    rows.filter((t) => t.template_key === key).sort((a, b) => b.version - a.version);

  if (query.isError) {
    return <div role="alert" className="text-body">
      <p>Templates could not be loaded. Try again.</p>
      <button className="btn-secondary mt-2" onClick={() => void query.refetch()}>Try again</button>
    </div>;
  }

  if (editor) {
    const problems = fieldProblems(editor.purpose, editor.body);
    const canReview = editor.name.trim() !== "" && editor.body.trim() !== "" && problems.length === 0;
    return <div className="grid gap-3 md:grid-cols-2" data-testid="template-editor">
      <div>
        <h3 className="text-body font-semibold mb-2">
          {editor.templateKey ? "Edit template" : "New template"} · {PAYMENT_TEMPLATE_PURPOSE_WORD[editor.purpose]}
        </h3>
        {!reviewing ? <div className="space-y-2">
          <Input id="template-name" label="Template name" value={editor.name}
            onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
          <label className="block">
            <span className="text-label">Wording</span>
            <textarea value={editor.body} rows={10} aria-label="Wording"
              onChange={(e) => setEditor({ ...editor, body: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" />
          </label>
          <p className="text-label font-normal">
            Protected fields fill themselves: {KNOWN_FIELDS.map((f) => `{${f}}`).join(" · ")}
          </p>
          {problems.map((p) => <p key={p} className="text-label font-normal text-danger">{p}</p>)}
          <div className="flex gap-2">
            <Button variant="primary" disabled={!canReview}
              onClick={() => setReviewing(true)}>Review changes</Button>
            <Button variant="neutral" onClick={() => { setEditor(null); setReviewing(false); }}>Cancel</Button>
          </div>
        </div> : <div className="space-y-2 text-body" data-testid="template-review">
          <p className="font-semibold">Review changes</p>
          {editor.before && editor.before.body !== editor.body && <details>
            <summary className="cursor-pointer text-label">Wording before this change</summary>
            <pre className="whitespace-pre-wrap font-sans text-label font-normal">{editor.before.body}</pre>
          </details>}
          <p className="text-label font-normal">Saving keeps every earlier version in history.</p>
          <div className="flex gap-2">
            <Button variant="primary" loading={save.isPending}
              onClick={() => save.mutate({
                templateKey: editor.templateKey, purpose: editor.purpose,
                name: editor.name.trim(), body: editor.body,
              })}>Save template</Button>
            <Button variant="neutral" onClick={() => setReviewing(false)}>Back</Button>
          </div>
        </div>}
      </div>
      <div data-testid="template-preview">
        <h3 className="text-body font-semibold mb-2">What the customer receives</h3>
        <pre className="whitespace-pre-wrap rounded-card border border-base-200 bg-white p-3 font-sans text-body">
          {renderPaymentTemplate(editor.body, SAMPLE_FACTS)}
        </pre>
      </div>
    </div>;
  }

  return <div className="space-y-3" data-testid="template-library">
    {PAYMENT_TEMPLATE_PURPOSES.map((purpose) => {
      const list = heads.filter((t) => t.purpose === purpose);
      return <div key={purpose}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-body font-semibold">{PAYMENT_TEMPLATE_PURPOSE_WORD[purpose]}</h3>
          <Button variant="neutral" size="sm" onClick={() => {
            setEditor({ templateKey: null, purpose, name: "", body: "", before: null });
            setReviewing(false);
          }}>New template</Button>
        </div>
        {list.length === 0 && <p className="text-label font-normal">
          No template yet. The approved wording must come from its owner.
        </p>}
        {list.map((t) => <div key={t.template_key} className="mt-1 text-body">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t.name}</span>
            <span className="text-label font-normal">V{t.version}</span>
            {t.is_default && <span className="text-label">Default</span>}
            {!t.active && <span className="text-label">Inactive</span>}
            <span className="ml-auto flex flex-wrap gap-2">
              <button className="text-meta font-semibold text-kit-blue-11" onClick={() => {
                setEditor({ templateKey: t.template_key, purpose: t.purpose,
                  name: t.name, body: t.body, before: t });
                setReviewing(false);
              }}>Edit</button>
              <button className="text-meta font-semibold text-kit-blue-11" onClick={() => {
                setEditor({ templateKey: null, purpose: t.purpose,
                  name: `${t.name} (copy)`, body: t.body, before: null });
                setReviewing(false);
              }}>Duplicate</button>
              {!t.is_default && t.active &&
                <button className="text-meta font-semibold text-kit-blue-11"
                  onClick={() => setDefault.mutate(t.template_key)}>Set as default</button>}
              <button className="text-meta font-semibold text-kit-blue-11"
                onClick={() => setActive.mutate({ templateKey: t.template_key, active: !t.active })}>
                {t.active ? "Make inactive" : "Make active"}
              </button>
              <button className="text-meta font-semibold text-kit-blue-11"
                onClick={() => setHistoryKey(historyKey === t.template_key ? null : t.template_key)}>
                View history
              </button>
            </span>
          </div>
          {historyKey === t.template_key && <div className="mt-1 space-y-1" data-testid="template-history">
            {versionsOf(t.template_key).map((v) => <details key={v.id}>
              <summary className="cursor-pointer text-label">
                V{v.version} · {fmtDate(v.created_at, { time: true })}{v.is_head ? " · current" : ""}
              </summary>
              <pre className="whitespace-pre-wrap font-sans text-label font-normal">{v.body}</pre>
            </details>)}
          </div>}
        </div>)}
      </div>;
    })}
  </div>;
}
