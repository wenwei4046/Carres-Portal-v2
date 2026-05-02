import { useMemo, useState } from "react";
import type { ProductCategory, ProductModelDto, ProductSkuDto } from "@carres/shared";
import { useCatalog } from "@/lib/queries";

const CATEGORIES: { key: ProductCategory; label: string; icon: string }[] = [
  { key: "mattress", label: "Mattress", icon: "▭" },
  { key: "bedframe", label: "Bed frame", icon: "▤" },
  { key: "sofa", label: "Sofa", icon: "▦" },
];

export default function DealerProducts() {
  const [activeCat, setActiveCat] = useState<ProductCategory>("mattress");
  const [search, setSearch] = useState("");
  const catalog = useCatalog();

  const skusByModel = useMemo(() => {
    const map = new Map<string, ProductSkuDto[]>();
    for (const s of catalog.data?.skus ?? []) {
      const arr = map.get(s.modelId) ?? [];
      arr.push(s);
      map.set(s.modelId, arr);
    }
    return map;
  }, [catalog.data]);

  if (catalog.isPending) {
    return <div className="p-9 text-sm text-muted-foreground">Loading catalog…</div>;
  }
  if (catalog.error) {
    return (
      <div className="p-9">
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Couldn't load catalog: {(catalog.error as Error).message}
        </p>
      </div>
    );
  }

  const allModels = catalog.data?.models ?? [];
  const inCat = allModels.filter((m) => m.category === activeCat);
  const filtered = search
    ? inCat.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          (m.blurb ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : inCat;

  // Counts per category for the tab badges
  const countsByCat: Record<ProductCategory, { models: number; skus: number }> = {
    mattress: { models: 0, skus: 0 },
    bedframe: { models: 0, skus: 0 },
    sofa: { models: 0, skus: 0 },
  };
  for (const m of allModels) {
    countsByCat[m.category].models += 1;
    countsByCat[m.category].skus += skusByModel.get(m.id)?.length ?? 0;
  }

  return (
    <div className="p-9">
      <header className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Catalog</p>
          <h1 className="font-display text-3xl mt-1.5 tracking-tight">What's on offer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Prices set by Carres principal · {allModels.length} models live
          </p>
        </div>
        <input
          type="search"
          aria-label="Search models"
          placeholder="Search models…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3.5 py-2 border border-border rounded-md text-sm font-body min-w-[240px] bg-card"
        />
      </header>

      {/* Category tabs */}
      <div className="flex gap-2 mb-5">
        {CATEGORIES.map((c) => {
          const active = activeCat === c.key;
          const count = countsByCat[c.key];
          return (
            <button
              key={c.key}
              onClick={() => setActiveCat(c.key)}
              className={`px-4 py-3 border-[1.5px] rounded-md flex items-center gap-2.5 text-left ${
                active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <span className="text-xl">{c.icon}</span>
              <div>
                <div className="text-sm font-semibold">{c.label}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {count.skus} variants · {count.models} models
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Models grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filtered.map((m) => (
          <ModelCard key={m.id} model={m} skus={skusByModel.get(m.id) ?? []} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-md border border-border bg-card p-9 text-center text-sm text-muted-foreground">
            {search ? `No models match "${search}".` : `No ${activeCat} models in the catalog yet.`}
          </div>
        )}
      </div>
    </div>
  );
}

function ModelCard({ model, skus }: { model: ProductModelDto; skus: ProductSkuDto[] }) {
  const minPrice = skus.length ? Math.min(...skus.map((s) => s.price)) : null;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <ProductSpecimen category={model.category} />
      <div className="p-4">
        <div className="flex justify-between items-baseline">
          <h2 className="font-display text-lg font-semibold tracking-tight">{model.name}</h2>
          {minPrice !== null && (
            <span className="font-mono text-xs text-muted-foreground">
              from <strong className="text-foreground">RM {minPrice.toLocaleString()}</strong>
            </span>
          )}
        </div>
        {model.blurb && <p className="text-xs text-muted-foreground mt-1">{model.blurb}</p>}

        {/* Attribute chips */}
        {model.category === "bedframe" && (model.colors?.length || model.gaps?.length) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {model.colors?.map((c) => (
              <span key={c} className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-secondary">
                {c}
              </span>
            ))}
            {model.gaps && model.gaps.length > 0 && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                Gaps · {model.gaps.join(" / ")}
              </span>
            )}
          </div>
        )}
        {model.category === "sofa" && model.sofaMode && (
          <div className="flex flex-wrap gap-1 mt-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-secondary">
              {model.sofaMode === "both" ? "preset · custom" : model.sofaMode}
            </span>
          </div>
        )}

        {/* Variants list */}
        {skus.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-1.5">
            {skus.map((s) => (
              <span
                key={s.id}
                className="font-mono text-[11px] px-2 py-1 border border-border rounded text-muted-foreground"
                title={s.sku}
              >
                {s.variant} <span className="text-foreground">RM {s.price.toLocaleString()}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductSpecimen({ category }: { category: ProductCategory }) {
  // Lightweight visual hint per category. Phase 2C may swap to real images
  // once `product_models.image_url` lands.
  const tone =
    category === "mattress"
      ? "from-primary/10 to-primary/5"
      : category === "bedframe"
        ? "from-secondary to-card"
        : "from-accent/30 to-accent/10";
  const glyph = category === "mattress" ? "▭" : category === "bedframe" ? "▤" : "▦";
  return (
    <div className={`h-32 grid place-items-center bg-gradient-to-br ${tone} text-3xl text-foreground/30`}>
      {glyph}
    </div>
  );
}
