import { useEffect } from "react";
import { X } from "lucide-react";
import type {
  ProductModelDto,
  ProductSkuDto,
  SofaFabricDto,
  FabricTierGlobalConfig,
  ModelFabricTierOverrideDto,
  SofaCompartmentDto,
  ModelSofaCompartmentDto,
  SofaComboDto,
} from "@carres/shared";
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
  fabricTierConfig,
  modelFabricTierOverrides,
  sofaCompartments,
  modelSofaCompartments,
  sofaCombos,
  onAdd,
  onClose,
}: {
  model: ProductModelDto;
  meta: ModelMeta | undefined;
  skus: ProductSkuDto[];
  fabrics: SofaFabricDto[];
  fabricTierConfig?: FabricTierGlobalConfig | null;
  modelFabricTierOverrides?: ModelFabricTierOverrideDto[] | null;
  /** Sofa engine (0178/0179) — passed through to ConfiguratorForModel so an
   *  offered-compartment sofa model opens the visual builder. ADDITIVE. */
  sofaCompartments?: SofaCompartmentDto[] | null;
  modelSofaCompartments?: ModelSofaCompartmentDto[] | null;
  sofaCombos?: SofaComboDto[] | null;
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
    <>
      {/* Ink-wash + blur scrim */}
      <div
        onClick={onClose}
        role="presentation"
        className="pos-drawer-scrim"
        aria-hidden="true"
      />

      {/* White slide-in panel */}
      <div
        className="fixed inset-y-0 right-0 z-[60] flex flex-col bg-white animate-drawer-slide-in"
        style={{
          width: 460,
          maxWidth: "100vw",
          boxShadow: "-4px 0 32px rgba(17,24,39,0.12)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`Configure ${model.name}`}
        data-testid="pos-configure-drawer"
      >
        {/* Header — model name + live-price hero */}
        <header
          className="px-6 pt-5 pb-4 flex items-start justify-between gap-4"
          style={{ borderBottom: "1px solid hsl(var(--base-200))" }}
        >
          <div className="min-w-0 flex-1">
            <p className="kicker mb-0.5">{CATEGORY_LABEL[model.category]}</p>
            <h2 className="t-h3 truncate">{model.name}</h2>
            {meta && (
              <p className="mt-1 leading-none">
                <span className="pos-price-rm t-tiny">From RM</span>
                <span className="pos-price text-[22px]">
                  {meta.fromPrice.toLocaleString()}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close configure drawer"
            className="btn-ghost p-2 mt-0.5 shrink-0"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {/* Configurator body */}
        <div className="p-6 flex-1 overflow-auto">
          {model.blurb && (
            <p className="t-small text-base-500 mb-5">{model.blurb}</p>
          )}
          <ConfiguratorForModel
            key={model.id}
            model={model}
            skus={skus}
            fabrics={fabrics}
            fabricTierConfig={fabricTierConfig}
            modelFabricTierOverrides={modelFabricTierOverrides}
            sofaCompartments={sofaCompartments}
            modelSofaCompartments={modelSofaCompartments}
            sofaCombos={sofaCombos}
            onAdd={(line) => {
              onAdd(line);
              onClose();
            }}
          />
        </div>
      </div>
    </>
  );
}
