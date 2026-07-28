import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
// UI-KIT §3.1 — "The law names the STEP, never the hex", so the hexes are read
// out of @radix-ui/colors rather than typed here. Nobody maintains a hex table
// and nobody can mistype a digit. Card D0.5a.
import { amber, blue, green, red, slate } from "@radix-ui/colors";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        base: {
          50:  "hsl(var(--base-50))",
          100: "hsl(var(--base-100))",
          200: "hsl(var(--base-200))",
          300: "hsl(var(--base-300))",
          400: "hsl(var(--base-400))",
          500: "hsl(var(--base-500))",
          600: "hsl(var(--base-600))",
          700: "hsl(var(--base-700))",
          800: "hsl(var(--base-800))",
          900: "hsl(var(--base-900))",
        },
        terracotta: "hsl(var(--terracotta))",
        // Signature tints — light fills for active states + darker hover.
        // Mirrors --signature-50/100/700 in index.css.
        signature: {
          50:  "hsl(var(--signature-50))",
          100: "hsl(var(--signature-100))",
          700: "hsl(var(--signature-700))",
        },
        // Proto warm-linen status palette. *-soft variants are the muted
        // background fills used inside callout boxes (e.g. "Ready to proceed").
        success: {
          DEFAULT: "hsl(var(--success))",
          soft: "hsl(var(--success-soft))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          soft: "hsl(var(--warning-soft))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          soft: "hsl(var(--info-soft))",
          foreground: "hsl(var(--info-foreground))",
        },
        // THE hover tint — hover:bg-hovertint on every clickable row/nav/chip.
        hovertint: "hsl(var(--hover-tint))",
        error: {
          // --error shares its hue/saturation with --destructive to keep
          // shadcn primitives (alerts, toasts) untouched. The *-soft variant
          // is the only piece proto adds on top.
          soft: "hsl(var(--error-soft))",
        },
        /* ⭐ THE KIT PALETTE (UI-KIT §3.2 · §3.3, card D0.5a) — Radix steps,
         * namespaced under `kit` so they ADD to the palette instead of
         * overriding Tailwind's own blue/green/amber/red, which 76 live class
         * uses still depend on. Only the steps the law names exist here: a
         * chat reaching for `bg-kit-slate-4` gets nothing, which is the point.
         * The legacy `base-*` / `success` / `warning` ramps stay untouched
         * until the D2–D4 codemods move the pages over. */
        kit: {
          slate: {
            3: slate.slate3, // page canvas (Q2, frozen)
            5: slate.slate5, // hairline — table lines, card edge
            6: slate.slate6, // stronger divider — section split
            9: slate.slate9, // icon at rest · placeholder
            11: slate.slate11, // secondary text
            12: slate.slate12, // primary text
          },
          blue: {
            3: blue.blue3, // selected row · hover tint · info fill
            9: blue.blue9, // the one action fill · focus ring
            11: blue.blue11, // action ink
          },
          green: { 3: green.green3, 11: green.green11 }, // done · received · in stock
          amber: { 3: amber.amber3, 11: amber.amber11 }, // needs attention · waiting
          red: { 3: red.red3, 9: red.red9, 11: red.red11 }, // late · act now
        },
      },
      /* ⭐ THE KIT TYPE SCALE (UI-KIT §2.1, card D0.5a) — six tokens, each
       * carrying size + weight + line-height in ONE class, so a page cannot
       * half-apply a token. A seventh size means editing this file, which is
       * exactly the friction the law wants. These ADD to Tailwind's defaults;
       * `text-sm` etc. still resolve for the 225 unmigrated pages.
       *
       * The law's token names (`t-page` … `t-label`) could not be used as CSS
       * class names — `.t-body` is already the retired v17 ramp's 14px/400 in
       * index.css and is live in 5 files. UI-KIT §2.1 records the mapping. */
      fontSize: {
        page: ["24px", { lineHeight: "32px", fontWeight: "600" }],
        title: ["20px", { lineHeight: "28px", fontWeight: "600" }],
        strong: ["15px", { lineHeight: "22px", fontWeight: "600" }],
        body: ["13px", { lineHeight: "18px", fontWeight: "400" }],
        meta: ["12px", { lineHeight: "16px", fontWeight: "400" }],
        label: ["11px", { lineHeight: "14px", fontWeight: "500" }],
      },
      fontFamily: {
        // v17 (2026-06-09): Inter is the workhorse UI font for body + display.
        // DM Sans kept in the fallback chain. Big Shoulders Stencil stays on
        // `font-stencil` for future poster/login-mark surfaces.
        sans: ["Inter", "DM Sans", "system-ui", "sans-serif"],
        display: ["Inter", "DM Sans", "system-ui", "sans-serif"],
        // `font-body` is the explicit alias used by `lib/cjk.ts`'s ASCII
        // branch — same Inter chain as `font-sans`, so existing components are
        // unaffected. Keeps the CJK helper readable:
        // `cjkClassName(s) → "font-cjk" | "font-body"`.
        body: ["Inter", "DM Sans", "system-ui", "sans-serif"],
        // CJK fallback chain. `lib/cjk.ts` switches surfaces with mixed CN/EN
        // text (dealer/customer/warehouse names) to this family so glyphs
        // render cleanly. Noto Sans SC also covers Latin so ASCII stays sharp.
        cjk: ['"Noto Sans SC"', "DM Sans", "system-ui", "sans-serif"],
        stencil: ["Big Shoulders Stencil Display", "DM Sans", "sans-serif"],
        // Editorial display family for the proto Login page only. Mulish is the
        // Google Fonts substitute for proto's paid "Cera Pro" — same warm-humanist
        // proportions, free license. Keep scoped to Login.tsx; other pages use
        // `font-display` (DM Sans) per CLAUDE.md §10.
        editorial: ['"Cera Pro"', "Mulish", "DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        // POS price hero — Archivo Black (2990s-style), condensed via
        // font-stretch in CSS. Falls back to Inter / system-ui.
        price: ["Archivo", "Inter", "system-ui", "sans-serif"],
      },
      /* ⭐ THE OVERLAY SIZES (card D0.5b) — ONE modal width, ONE drawer width,
       * ONE dialog height cap. They are named config keys rather than
       * `max-w-lg` / `max-h-[85vh]` in a component for the same reason the type
       * scale is: a number typed into a component is a number the next
       * component types differently. §8 has not written the portal's width
       * table yet — `PageShell` (D0.5c) does, and takes these over. */
      maxWidth: {
        modal: "512px", // a question, an answer, and two buttons
        drawer: "560px", // a record read beside the list it came from
      },
      maxHeight: {
        dialog: "85vh", // the surface never outgrows the screen; the body scrolls
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        /* ⭐ THE KIT RADII (UI-KIT §4.2, card D0.5a) — four, frozen, named by
         * USE so a chat picks the surface rather than a number. `rounded-full`
         * (avatar · status dot) is Tailwind's own and needs no entry. */
        pill: "4px", // pill · small tag · checkbox
        control: "6px", // button · input · dropdown
        card: "10px", // card · panel · modal · drawer
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
