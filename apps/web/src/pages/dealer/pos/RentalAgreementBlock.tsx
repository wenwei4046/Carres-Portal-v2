import { useRentalAgreementTemplate } from "@/lib/queries";
import { AgreementBody } from "@/pages/rental/AgreementsSection";

/**
 * The paper, on the confirm step, before the customer signs (0279).
 *
 * Until now the rental lane asked for a signature with nothing on screen to
 * sign — the T&C existed as a `rental_agreement_templates` row the store JWT
 * could not even read (RLS internal-only), and the signature the pad captured
 * was thrown away on submit. This is the reading half of that fix.
 *
 * It deliberately reuses `AgreementBody`, the SAME renderer the principal
 * previews a version with. One component means the document Loo approves and
 * the document a customer reads cannot drift into two different papers.
 *
 * The three states are all real answers:
 *   · loading  — say so, do not render an empty contract
 *   · null     — nobody has published wording, so no rental can be signed at
 *                all. Name the screen that fixes it; the submit would 422 with
 *                `no_agreement_template` anyway, and a button that always fails
 *                with no explanation is how an operator learns to distrust the
 *                system.
 *   · a version — show which one, because that number is what gets stamped on
 *                the contract and is the difference between evidence and a
 *                picture of a squiggle.
 */
export default function RentalAgreementBlock() {
  const q = useRentalAgreementTemplate();
  const template = q.data?.template ?? null;

  if (q.isLoading) {
    return (
      <div
        className="rounded-md border border-border bg-card px-4 py-3 mb-4"
        data-testid="rental-agreement-loading"
      >
        <div className="t-small text-muted-foreground">Loading the rental agreement…</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div
        className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 mb-4"
        data-testid="rental-agreement-missing"
      >
        <div className="t-small font-semibold text-amber-900">
          No rental agreement has been published yet
        </div>
        <p className="t-tiny text-amber-800 mt-1 leading-relaxed">
          A rent-to-own contract cannot be signed until the wording exists. Ask the principal to
          open <strong>Admin → Rental → Agreements</strong> and save it. This order cannot be
          completed until then.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-border bg-card px-4 py-3 mb-4"
      data-testid="rental-agreement-block"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <div className="t-small font-semibold text-foreground">{template.name}</div>
        {/* The version is not decoration — it is stamped onto the agreement so
            the contract can be re-rendered exactly as it was signed. */}
        <span className="t-tiny text-muted-foreground font-mono">v{template.version}</span>
      </div>
      <p className="t-tiny text-muted-foreground mb-2 leading-relaxed">
        Let the customer read this before they sign. Signing records this version against the
        agreement.
      </p>
      <AgreementBody blocks={template.body} />
    </div>
  );
}
