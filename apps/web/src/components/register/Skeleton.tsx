// Skeleton — the Register Engine's loading shimmer.
//
// COPIED from 2990s/apps/backend/src/components/Skeleton.tsx (RG-2), trimmed
// to the two pieces the engine consumes: the base block + SkeletonRows (the
// <tr>/<td> rows DataGrid drops into its tbody while loading). The unused
// card/table/page variants were NOT carried over — dead kit code is drift.

import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

// ---------------------------------------------------------------------------
// Base — single shimmer rectangle. Width/height accept number (px) or string.
// ---------------------------------------------------------------------------

interface SkeletonProps {
  w?: number | string;
  h?: number | string;
  rounded?: boolean;
  className?: string;
  style?: CSSProperties;
}

const dim = (v: number | string | undefined): string | undefined =>
  v === undefined ? undefined : typeof v === "number" ? `${v}px` : v;

export const Skeleton = ({ w, h, rounded = false, className, style }: SkeletonProps) => (
  <span
    className={`${styles.block} ${rounded ? styles.blockRounded : ""} ${className ?? ""}`}
    style={{ width: dim(w), height: dim(h), ...style }}
    aria-hidden="true"
  />
);

// ---------------------------------------------------------------------------
// Table rows — <tr>/<td> based so they drop straight into a real <tbody>
// (DataGrid's loading state). `cols` should match the grid's column count.
// ---------------------------------------------------------------------------

export const SkeletonRows = ({ cols, rows = 10 }: { cols: number; rows?: number }) => (
  <>
    {Array.from({ length: rows }).map((_, r) => (
      <tr key={r} aria-hidden="true">
        {Array.from({ length: Math.max(cols, 1) }).map((_, c) => (
          <td key={c} style={{ padding: "6px 10px" }}>
            {/* Vary widths a little so it reads as data, not a flat grid. */}
            <Skeleton h={12} w={c === 0 ? 16 : `${55 + ((r * 7 + c * 13) % 40)}%`} />
          </td>
        ))}
      </tr>
    ))}
  </>
);
