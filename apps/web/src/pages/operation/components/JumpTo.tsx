/**
 * JumpTo — the page header's navigator (owner ruling 2026-08-11: the 44px
 * page header keeps **Jump to · Notifications · Help · Settings**, and none of
 * them may fall into the Work Toolbar or its overflow).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ IT NAVIGATES, AND THAT IS ALL IT DOES.
 *
 * The destinations are `PORTAL_NAV` itself — the SAME list the sidebar draws,
 * filtered by the SAME `visibleGroups`/`visibleItems` role rules and resolved
 * by the SAME `navItemHref`. There is no second nav table, so a page can never
 * exist in one and not the other (Law D applied to navigation: one arithmetic,
 * never two that currently agree).
 *
 * It invents no destination, shows no count and carries no business data — a
 * header utility is not a work surface.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  navItemHref,
  visibleGroups,
  visibleItems,
  type PortalNavGroup,
  type PortalNavItem,
} from "@/pages/portal/portal-nav";

interface Dest {
  key: string;
  label: string;
  area: string;
  href: string;
}

export default function JumpTo() {
  const navigate = useNavigate();
  const role = useAuth((s) => s.role);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const destinations = useMemo<Dest[]>(() => {
    const out: Dest[] = [];
    for (const g of visibleGroups(role) as PortalNavGroup[]) {
      for (const it of visibleItems(g, role) as PortalNavItem[]) {
        out.push({
          key: `${g.area}:${it.key}`,
          label: it.label,
          area: g.label,
          href: navItemHref(g, it),
        });
      }
    }
    return out;
  }, [role]);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return destinations;
    return destinations.filter(
      (d) =>
        d.label.toLowerCase().includes(needle) || d.area.toLowerCase().includes(needle),
    );
  }, [destinations, q]);

  /* Reopening always starts clean: a stale query from ten minutes ago is a
     worse default than an empty box. */
  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (d: Dest | undefined) => {
    if (!d) return;
    setOpen(false);
    navigate(d.href);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        data-testid="jump-to"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Jump to"
        className="inline-flex h-7 items-center gap-1.5 rounded-control border border-base-200 bg-white px-2 text-meta text-base-500 hover:bg-hovertint hover:text-base-700"
      >
        <Search size={14} strokeWidth={2} aria-hidden />
        <span>Jump to</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Jump to"
          className="absolute right-0 top-9 z-50 w-72 overflow-hidden rounded-card border border-base-200 bg-white shadow-lg"
        >
          <div className="flex items-center gap-1.5 border-b border-base-100 px-2.5 py-2">
            <Search size={14} strokeWidth={2} className="shrink-0 text-base-400" aria-hidden />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, hits.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(hits[cursor]);
                }
              }}
              placeholder="Go to a page…"
              aria-label="Go to a page"
              className="w-full bg-transparent text-meta text-base-900 outline-none placeholder:text-base-400"
            />
          </div>
          <div className="max-h-72 overflow-auto py-1">
            {hits.length === 0 ? (
              <p className="px-3 py-2 text-meta text-base-500">No page by that name</p>
            ) : (
              hits.map((d, i) => (
                <button
                  key={d.key}
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(d)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-meta ${
                    i === cursor ? "bg-hovertint" : ""
                  }`}
                >
                  <span className="truncate text-base-900">{d.label}</span>
                  <span className="ml-auto shrink-0 text-label text-base-400">{d.area}</span>
                  {i === cursor && (
                    <CornerDownLeft
                      size={12}
                      strokeWidth={2}
                      className="shrink-0 text-base-400"
                      aria-hidden
                    />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
