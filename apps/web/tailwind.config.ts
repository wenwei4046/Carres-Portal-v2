import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
// Colours come from the ONE token file (styles/carres-tokens.css) through
// CSS variables; nothing here types a hex.


/* ⭐ THE ONE KIT for Tailwind's own colour families (owner 2026-10-08/09: every
 * page takes the v4 kit). Pages that still write `text-blue-700` or
 * `bg-amber-50` get the v4 MEANING of that family — light steps are the soft
 * fill, dark steps the text — from styles/carres-tokens.css, so no page keeps
 * a colour outside the kit. Decorative identity hues (violet, pink, teal…)
 * are left as they are. */
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
const pair = (soft: string, edge: string, ink: string) =>
  Object.fromEntries(STEPS.map((s) => [s, Number(s) <= 200 ? soft : Number(s) <= 400 ? edge : ink]));
const ladder = {
  50: "var(--c-ground)", 100: "var(--c-hover)", 200: "var(--c-card-border)", 300: "var(--c-input-border)",
  400: "var(--c-muted)", 500: "var(--c-secondary)", 600: "var(--c-tab)", 700: "var(--c-body)",
  800: "var(--c-ink)", 900: "var(--c-ink)", 950: "var(--c-ink)",
};
const KIT_FAMILIES = {
  /* blue was info and the action ink: info is the grey pair, action ink is ink */
  blue: pair("var(--c-info-bg)", "var(--c-btn-border)", "var(--c-ink)"),
  sky: pair("var(--c-info-bg)", "var(--c-btn-border)", "var(--c-ink)"),
  indigo: pair("var(--c-info-bg)", "var(--c-btn-border)", "var(--c-ink)"),
  amber: pair("var(--c-warn-bg)", "var(--c-btn-border)", "var(--c-warn-fg)"),
  orange: pair("var(--c-warn-bg)", "var(--c-btn-border)", "var(--c-warn-fg)"),
  yellow: pair("var(--c-warn-bg)", "var(--c-btn-border)", "var(--c-warn-fg)"),
  red: pair("var(--c-err-bg)", "var(--c-btn-border)", "var(--c-err-fg)"),
  rose: pair("var(--c-err-bg)", "var(--c-btn-border)", "var(--c-err-fg)"),
  green: pair("var(--c-ok-bg)", "var(--c-btn-border)", "var(--c-ok-fg)"),
  emerald: pair("var(--c-ok-bg)", "var(--c-btn-border)", "var(--c-ok-fg)"),
  gray: ladder, slate: ladder, zinc: ladder, neutral: ladder, stone: ladder,
};

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
        ...KIT_FAMILIES,
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        /* The page ground follows the person's Appearance theme (handoff v4,
         * UI Kit §9): `--c-ground` is set per `data-theme` on <html>. */
        background: "var(--c-ground)",
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
        /* THE CARRES TOKENS (owner-confirmed handoff 2026-10-08,
         * `src/styles/carres-tokens.css`). Every colour of the shell and of a
         * restyled page is one of these; nothing else. */
        c: {
          ink: "var(--c-ink)",
          body: "var(--c-body)",
          tab: "var(--c-tab)",
          secondary: "var(--c-secondary)",
          muted: "var(--c-muted)",
          menu: "var(--c-menu)",
          ground: "var(--c-ground)",
          card: "var(--c-card)",
          hover: "var(--c-hover)",
          "card-border": "var(--c-card-border)",
          "btn-border": "var(--c-btn-border)",
          "head-line": "var(--c-head-line)",
          "row-line": "var(--c-row-line)",
          "footer-line": "var(--c-footer-line)",
          "section-line": "var(--c-section-line)",
          "input-border": "var(--c-input-border)",
          "search-bg": "var(--c-search-bg)",
          "select-bg": "var(--c-select-bg)",
          "select-fg": "var(--c-select-fg)",
          "ok-bg": "var(--c-ok-bg)",
          "ok-fg": "var(--c-ok-fg)",
          "warn-bg": "var(--c-warn-bg)",
          "warn-fg": "var(--c-warn-fg)",
          "err-bg": "var(--c-err-bg)",
          "err-fg": "var(--c-err-fg)",
          "info-bg": "var(--c-info-bg)",
          "info-fg": "var(--c-info-fg)",
          "hold-bg": "var(--c-hold-bg)",
          "hold-fg": "var(--c-hold-fg)",
          online: "var(--c-online)",
        },
        /* The Work page's own ladder (Work middle-card kit, 2026-09-24).
         * Values live in index.css; only Work reads these names. */
        work: {
          line: "var(--work-line)",
          "line-hover": "var(--work-line-hover)",
          ink: "var(--work-ink)",
          slate: "var(--work-slate)",
          muted: "var(--work-muted)",
          tabs: "var(--work-tabs)",
          "missed-fill": "var(--work-missed-fill)",
          "missed-line": "var(--work-missed-line)",
          "missed-ink": "var(--work-missed-ink)",
        },
        /* ⭐ THE KIT PALETTE (UI-KIT §3.2 · §3.3, card D0.5a) — Radix steps,
         * namespaced under `kit` so they ADD to the palette instead of
         * overriding Tailwind's own blue/green/amber/red, which 76 live class
         * uses still depend on. Only the steps the law names exist here: a
         * chat reaching for `bg-kit-slate-4` gets nothing, which is the point.
         * The legacy `base-*` / `success` / `warning` ramps stay untouched
         * until the D2–D4 codemods move the pages over. */
        kit: {
          /* SURFACE LAW (Jess, 2026-08-02, Purchase Orders first): grey is
           * CHROME — app background, header strip, table header — and every
           * WORKING surface (listing, workspace, nav, cards) is white. Three
           * greys per page, maximum. Copy Linear: the chrome greys sit so
           * close to white the data always outweighs them. Runs on Purchase
           * Orders first; flows back portal-wide after she reviews it live. */
          canvas: "var(--c-ground)", // the theme ground (handoff v4, 2026-10-08) — formerly = #F7F8FA (Jess 2026-08-02; UI MASTER §6.7 2026-09-17) — body and every page read the same variable
          // `strip` retired the same day (Jess's polish: too many greys were
          // competing) — the header strip sits on the canvas, no grey of its own.
          /* ⭐ THE ONE KIT (owner 2026-10-08/09): every page takes the v4
           * kit. The Radix step NAMES stay, so the pages that use them need no
           * edit; each step now resolves to its v4 token (carres-tokens.css),
           * so the theme reaches them too. Blue was selection and the action
           * ink — selection is the theme's select pair, action ink is ink. */
          slate: {
            2: "var(--c-ground)", // expansion area · quiet fill
            3: "var(--c-search-bg)", // grey chrome · automatic field · header band
            4: "var(--c-input-border)", // quiet control border
            5: "var(--c-card-border)", // hairline — card edge, table line
            6: "var(--c-head-line)", // stronger divider — section split
            9: "var(--c-muted)", // icon at rest · placeholder
            11: "var(--c-secondary)", // secondary text
            12: "var(--c-ink)", // primary text
          },
          blue: {
            2: "var(--c-hover)", // row hover
            3: "var(--c-select-bg)", // selected row · active choice
            6: "var(--c-btn-border)", // edge of a selected surface
            9: "var(--c-ink)", // the one action fill — the charcoal main button
            11: "var(--c-ink)", // action ink — document links read in ink
          },
          green: { 3: "var(--c-ok-bg)", 11: "var(--c-ok-fg)" }, // done · received · in stock
          amber: { 3: "var(--c-warn-bg)", 6: "var(--c-btn-border)", 11: "var(--c-warn-fg)" }, // needs attention · waiting
          red: { 3: "var(--c-err-bg)", 9: "var(--c-err-fg)", 11: "var(--c-err-fg)" }, // late · act now
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
        /* The workspace toolbar control (Work, owner density ruling
           2026-09-25): 14/20 in a 36px (40px below 600px) control. */
        control: ["14px", { lineHeight: "20px", fontWeight: "400" }],
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
        // v4 kit: numbers and codes are Inter with tabular figures, never a
        // mono face (body carries `font-variant-numeric: tabular-nums`), so
        // the pages that still write `font-mono` read in Inter.
        mono: ["Inter", "DM Sans", "system-ui", "sans-serif"],
        // POS price hero — Archivo Black (2990s-style), condensed via
        // font-stretch in CSS. Falls back to Inter / system-ui.
        price: ["Archivo", "Inter", "system-ui", "sans-serif"],
      },
      /* ⭐ THE OVERLAY SIZES (card D0.5b) — TWO modal widths, ONE drawer width,
       * ONE dialog height cap. They are named config keys rather than
       * `max-w-lg` / `max-h-[85vh]` in a component for the same reason the type
       * scale is: a number typed into a component is a number the next
       * component types differently. §8 has not written the portal's width
       * table yet — `PageShell` (D0.5c) does, and takes these over.
       *
       * ⭐ P19 ADDED THE SECOND MODAL WIDTH (2026-08-05) AND THE NUMBER IS
       * MEASURED, NOT CHOSEN. D0.5b's *"a modal that can be told its width is
       * four widths by next quarter"* is answered by the SHAPE of the change,
       * not by refusing it: the set is CLOSED at two, both values live here,
       * and `Modal`'s prop is a union of one literal — so a page still cannot
       * type a number. Widening `modal` itself was the alternative and was
       * rejected: its own comment is the reason, most modals really are a
       * question and two buttons.
       *
       * Where 600 comes from, measured in a real browser on the LIVE dialog at
       * 1440×900 against the app's own stylesheet (P16's method). The binding
       * string is the longest SKU the picker can offer,
       * `SVC-DISPOSE-BEDFRAME` — 144.0px of 12px JetBrains Mono — and the
       * picker's SKU column is 30% of the table less 16px of cell padding:
       *
       *     modal   SKU column   available   144.0 of ink fits?
       *      512      142.8        126.8     NO  ← clipping on production today
       *      560      157.2        141.2     NO
       *      600      169.2        153.2     YES, 9.2px of headroom
       *
       * The algebraic minimum is 583; 600 is the round number above it, and
       * the 9.2px is deliberate — P16 shipped a column at exactly its
       * measurement once and the browser ellipsized it, because text metrics
       * are fractional and box widths round. */
      maxWidth: {
        modal: "512px", // a question, an answer, and two buttons
        "modal-wide": "600px", // a header and a LINE LIST — see above
        /* ⭐ THE THIRD WIDTH IS A PICTURE, AND IT IS MEASURED (Delivery driver
         * submission, 2026-09-11). The set stays CLOSED and the value stays
         * here — a page still cannot type a number — but a modal that shows a
         * PHOTO is not "a question and two buttons" and not "a line list": its
         * binding constraint is the height cap above it.
         *
         * Measured at 1440×900 against this stylesheet. `max-h-dialog` is 85vh
         * = 765px; the surface spends 56px on its header, 48px on the viewer's
         * previous/next row and 32px on padding, leaving 629px of image. A
         * phone photo is 4:3 (4032×3024 on the cameras Carres drivers carry),
         * so 629px of height wants 839px of width:
         *
         *     width   image box   4:3 at 629px tall fits?
         *      600       568       NO  — letterboxed, 61px of height wasted
         *      800       768       NO  — 71px short
         *      880       848       YES, 9px of headroom
         *
         * The algebraic minimum is 871; 880 is the round number above it, and
         * the headroom is deliberate for the same reason P19's was — box
         * widths round and text metrics are fractional. */
        "modal-viewer": "880px", // a PHOTO, sized by the height cap — see above
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
        work: "9px", // Work page sections and middle cards (Work kit 2026-09-24)
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
