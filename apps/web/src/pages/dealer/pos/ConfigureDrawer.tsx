import { useEffect } from "react";
import type { ProductModelDto, ProductSkuDto, SofaFabricDto } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import { CATEGORY_LABEL } from "@/pages/catalog/components/atoms";
import type { DraftLine } from "../new-order/draft";
import { ConfiguratorForModel } from "../new-order/configurators";
import type { ModelMeta } from "./catalog-index";

/**
 * Right slide-in drawer that configures one model (size / color / gap / fabric
 * + qty) and adds it to the cart. Mirrors the operation OrderDetailDrawer
 * shell (backdrop scrim + white panel + ESC). The configurator is keyed by
 * model.id so its per-category useState defaults re-init per model — the
 * SO-1006 remount discipline now lives here, and because the drawer opens
 * fresh per model it is guaranteed.
 */
export default function ConfigureDrawer({
  model,
  meta,
  skus,
  fabrics,
  onAdd,
  onClose,
}: {
  model: ProductModelDto;
  meta: ModelMeta | undefined;
  skus: ProductSkuDto[];
  fabrics: SofaFabricDto[];
  onAdd: (line: DraftLine) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="presentation"
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ background: "rgba(34,31,32,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Configure ${model.name}`}
        className="bg-card text-card-foreground border-l border-base-200 h-screen overflow-auto flex flex-col"
        style={{ width: 460, maxWidth: "100vw" }}
        data-testid="pos-configure-drawer"
      >
        <header className="px-6 pt-5 pb-3.5 border-b border-base-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="kicker text-base-400">{CATEGORY_LABEL[model.category]}</p>
            <h2 className="t-h3 mt-0.5 truncate">{model.name}</h2>
            {meta && (
              <p className="t-tiny text-base-500 mt-0.5">
                From{" "}
                <span className="font-mono font-semibold text-base-900">
                  {rm(meta.fromPrice)}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-ghost text-xl leading-none px-2 py-1"
          >
            ×
          </button>
        </header>

        <div className="p-6 flex-1">
          {model.blurb && (
            <p className="t-small text-base-600 mb-4">{model.blurb}</p>
          )}
          <ConfiguratorForModel
            key={model.id}
            model={model}
            skus={skus}
            fabrics={fabrics}
            onAdd={(line) => {
              onAdd(line);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
