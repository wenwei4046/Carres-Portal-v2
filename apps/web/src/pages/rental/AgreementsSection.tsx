import { useMemo, useState } from "react";
import { FileSignature } from "lucide-react";
import { toast } from "sonner";
import type { AgreementBlock, RentalAgreementTemplate, RentalOfferCategory } from "@carres/shared";
import { agreementTokens, blocksFromText } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCreateAgreementTemplate, usePatchAgreementTemplate } from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { RENT_TO_OWN_V5 } from "./rent-to-own-v5";

/**
 * Agreements (0267) — the wording a rental signs.
 *
 * Loo's rules, honoured literally:
 *   · his document is printed VERBATIM — this surface never adds a clause, and
 *     the free service package is deliberately not in it (a promotion is not a
 *     term of the rental);
 *   · there is no draft state: an order cannot be created unless the customer
 *     has signed, so every agreement on file is a signed one. This tab holds
 *     the WORDING only; signed copies live on the sales order.
 *
 * A version is immutable. "New version" mints version+1 and leaves every
 * earlier version readable, because agreements were signed under it.
 */
export default function AgreementsSection({
  templates,
  isPrincipal,
}: {
  templates: RentalAgreementTemplate[];
  isPrincipal: boolean;
}) {
  const [editing, setEditing] = useState<{ docKey: string; name: string; blocks: AgreementBlock[] } | null>(
    null,
  );
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Newest version per document heads the list; older versions stay listed.
  const byDoc = useMemo(() => {
    const m = new Map<string, RentalAgreementTemplate[]>();
    for (const t of templates) {
      const arr = m.get(t.docKey) ?? [];
      arr.push(t);
      m.set(t.docKey, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => b.version - a.version);
    return [...m.entries()];
  }, [templates]);

  const hasRentToOwn = templates.some((t) => t.docKey === RENT_TO_OWN_V5.docKey);
  const preview = previewId ? templates.find((t) => t.id === previewId) ?? null : null;

  return (
    <section className="card p-5">
      <div className="text-strong font-display flex items-center gap-2 mb-1">
        <FileSignature size={16} strokeWidth={1.75} className="text-primary" />
        Agreements
        <span className="pill pill-neutral">{templates.length}</span>
      </div>
      <p className="text-meta text-base-500 mb-4 pb-3 border-b border-base-100">
        The wording a rental signs, printed as written. The POS fills the blanks and the customer
        signs at the sales order — no signature, no order, so there is no draft agreement.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {templates.length === 0 && (
        <div className="text-body text-base-500 py-3" data-testid="agreements-empty">
          No wording saved yet.
          {isPrincipal && " Load the supplied Rental Agreement below, read it, and save it as version 1."}
        </div>
      )}

      {byDoc.map(([docKey, versions]) => (
        <div key={docKey} className="mb-4 last:mb-0" data-testid={`agreement-doc-${docKey}`}>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-body font-semibold">{versions[0]!.name}</span>
            <span className="text-meta text-base-500">
              binds to {versions[0]!.bindsTo.length > 0 ? versions[0]!.bindsTo.join(" · ") : "nothing yet"}
            </span>
          </div>
          <div className="border border-base-200 rounded-[4px] overflow-x-auto">
            <div
              className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200 min-w-[620px]"
              style={{ gridTemplateColumns: GRID }}
            >
              <div className="label">Version</div>
              <div className="label">Effective</div>
              <div className="label text-right">Blocks</div>
              <div className="label text-right">Fields</div>
              <div className="label">Live</div>
              <div className="label text-right">Manage</div>
            </div>
            {versions.map((t) => (
              <VersionRow
                key={t.id}
                template={t}
                isLatest={t.version === versions[0]!.version}
                isPrincipal={isPrincipal}
                onPreview={() => setPreviewId(t.id)}
                onNewVersion={() =>
                  setEditing({ docKey: t.docKey, name: t.name, blocks: t.body })
                }
              />
            ))}
          </div>
        </div>
      ))}

      {isPrincipal && (
        <div className="flex flex-wrap gap-2 mt-4">
          {!hasRentToOwn && (
            <button
              type="button"
              onClick={() =>
                setEditing({
                  docKey: RENT_TO_OWN_V5.docKey,
                  name: RENT_TO_OWN_V5.name,
                  blocks: RENT_TO_OWN_V5.blocks,
                })
              }
              className="btn-primary text-meta"
              data-testid="agreement-load-supplied"
            >
              Load the supplied Rental Agreement (v5)
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing({ docKey: "", name: "", blocks: [] })}
            className="btn-ghost text-meta"
            data-testid="agreement-new-doc"
          >
            + Another document
          </button>
        </div>
      )}

      {editing && (
        <Modal
          title={editing.docKey ? `New version — ${editing.name}` : "New agreement document"}
          onClose={() => setEditing(null)}
          size="lg"
        >
          <WordingForm
            docKey={editing.docKey}
            name={editing.name}
            blocks={editing.blocks}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}

      {preview && (
        <Modal title={`${preview.name} · v${preview.version}`} onClose={() => setPreviewId(null)} size="lg">
          <AgreementBody blocks={preview.body} />
        </Modal>
      )}
    </section>
  );
}

const GRID = "90px 120px 90px 90px 90px 140px";

const errMsg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

function VersionRow({
  template,
  isLatest,
  isPrincipal,
  onPreview,
  onNewVersion,
}: {
  template: RentalAgreementTemplate;
  isLatest: boolean;
  isPrincipal: boolean;
  onPreview: () => void;
  onNewVersion: () => void;
}) {
  const patch = usePatchAgreementTemplate();

  return (
    <div
      className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 min-w-[620px] ${template.active ? "" : "opacity-60"}`}
      style={{ gridTemplateColumns: GRID }}
      data-testid={`agreement-version-${template.id}`}
    >
      <div className="t-num text-body">v{template.version}</div>
      <div className="text-meta text-base-500">{template.effectiveFrom}</div>
      <div className="text-right t-num text-meta">{template.body.length}</div>
      <div className="text-right t-num text-meta">{template.fields.length}</div>
      <div>
        {isPrincipal && isLatest ? (
          <input
            type="checkbox"
            checked={template.active}
            disabled={patch.isPending}
            onChange={() =>
              patch.mutate(
                { id: template.id, patch: { active: !template.active } },
                {
                  onSuccess: () => toast.success(template.active ? "Version retired" : "Version live"),
                  onError: (e: unknown) => toast.error(errMsg(e, "Update failed")),
                },
              )
            }
            aria-label={`Version ${template.version} live`}
            data-testid={`agreement-active-${template.id}`}
          />
        ) : (
          <span className={`pill ${template.active ? "pill-confirmed" : "pill-neutral"}`}>
            {template.active ? "Live" : "Retired"}
          </span>
        )}
      </div>
      <div className="text-right flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onPreview}
          className="btn-ghost text-label"
          data-testid={`agreement-preview-${template.id}`}
        >
          Preview
        </button>
        {isPrincipal && isLatest && (
          <button
            type="button"
            onClick={onNewVersion}
            className="btn-secondary text-label"
            data-testid={`agreement-new-version-${template.id}`}
          >
            New version
          </button>
        )}
      </div>
    </div>
  );
}

const CATEGORIES: RentalOfferCategory[] = ["mattress", "bedframe", "sofa", "accessory"];

/** Paste the wording (from Word), read what it will fill, save it as a version. */
function WordingForm({
  docKey,
  name: initialName,
  blocks: initialBlocks,
  onDone,
}: {
  docKey: string;
  name: string;
  blocks: AgreementBlock[];
  onDone: () => void;
}) {
  const create = useCreateAgreementTemplate();
  const [key, setKey] = useState(docKey);
  const [name, setName] = useState(initialName);
  const [binds, setBinds] = useState<RentalOfferCategory[]>(
    docKey === RENT_TO_OWN_V5.docKey ? (RENT_TO_OWN_V5.bindsTo as RentalOfferCategory[]) : [],
  );
  const [text, setText] = useState(() => initialBlocks.map((b) => b.text).join("\n\n"));

  // What the wording becomes — recomputed as it is edited, so the operator
  // sees the structure and the fields BEFORE saving.
  const blocks = useMemo(() => (text.trim() ? blocksFromText(text) : []), [text]);
  const tokens = useMemo(() => agreementTokens(blocks), [blocks]);
  const valid = key.trim().length >= 1 && name.trim().length >= 1 && blocks.length > 0;

  function save() {
    if (!valid || create.isPending) return;
    create.mutate(
      {
        docKey: key.trim(),
        name: name.trim(),
        bindsTo: binds,
        body: blocks,
      },
      {
        onSuccess: () => {
          toast.success("Wording saved");
          onDone();
        },
        onError: (e: unknown) => toast.error(errMsg(e, "Save failed")),
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="label mb-1">Document key</div>
          <input
            className={INPUT_CLS}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="rent_to_own"
            data-testid="agreement-key"
          />
        </div>
        <div>
          <div className="label mb-1">Name</div>
          <input
            className={INPUT_CLS}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rental Agreement — Terms and Conditions"
            data-testid="agreement-name"
          />
        </div>
      </div>
      <div>
        <div className="label mb-1">Binds to</div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() =>
                setBinds((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
              }
              className={`${binds.includes(c) ? "btn-primary" : "btn-ghost"} text-label capitalize`}
              data-testid={`agreement-binds-${c}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="label mb-1">Wording</div>
        <textarea
          className={`${INPUT_CLS} h-[260px] font-[inherit] leading-relaxed`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the agreement from Word. Blank lines separate paragraphs; a short line becomes a heading."
          data-testid="agreement-text"
        />
        <p className="text-meta text-base-400 mt-1.5">
          The words are yours — nothing is added. Write <span className="t-num">{"{{customer.name}}"}</span>{" "}
          style placeholders wherever the system should fill a blank.
        </p>
      </div>
      <div
        className="text-meta text-base-600 bg-base-50 border border-base-200 rounded-[4px] px-3 py-2"
        data-testid="agreement-parse-preview"
      >
        {blocks.length} block{blocks.length === 1 ? "" : "s"} ·{" "}
        {tokens.length === 0 ? (
          "no fields — the document will print exactly as typed"
        ) : (
          <>
            fills {tokens.length}: <span className="t-num">{tokens.join(" · ")}</span>
          </>
        )}
      </div>
      <ModalActions
        onCancel={onDone}
        onPrimary={save}
        primary="Save as new version"
        primaryDisabled={!valid}
        primaryPending={create.isPending}
      />
    </div>
  );
}

/** Renders the wording the way it prints. */
export function AgreementBody({ blocks }: { blocks: AgreementBlock[] }) {
  return (
    <div className="max-h-[60vh] overflow-y-auto pr-1" data-testid="agreement-body">
      {blocks.map((b, i) => {
        if (b.kind === "title") {
          return (
            <h3 key={i} className="text-strong font-display uppercase tracking-[0.08em] mb-1">
              {b.text}
            </h3>
          );
        }
        if (b.kind === "subtitle") {
          return (
            <div key={i} className="text-body font-semibold text-base-600 uppercase mb-4">
              {b.text}
            </div>
          );
        }
        if (b.kind === "h2") {
          return (
            <div key={i} className="text-body font-semibold mt-4 mb-1.5">
              {b.text}
            </div>
          );
        }
        if (b.kind === "li") {
          return (
            <div key={i} className="text-meta text-base-700 leading-relaxed pl-4 mb-1 relative">
              <span className="absolute left-0 top-0">·</span>
              {b.text}
            </div>
          );
        }
        return (
          <p key={i} className="text-meta text-base-700 leading-relaxed mb-2">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}
