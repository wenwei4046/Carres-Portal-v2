import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

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
        error: {
          // --error shares its hue/saturation with --destructive to keep
          // shadcn primitives (alerts, toasts) untouched. The *-soft variant
          // is the only piece proto adds on top.
          soft: "hsl(var(--error-soft))",
        },
      },
      fontFamily: {
        // Body / display both use DM Sans per the Warm Linen preset in
        // reference/shared/styles.css. The proto reserves Big Shoulders Stencil
        // for nothing in this preset; v2 keeps it on `font-stencil` for any
        // future poster/login-mark surface but no current page uses it.
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["DM Sans", "system-ui", "sans-serif"],
        // `font-body` is the explicit alias used by `lib/cjk.ts`'s ASCII
        // branch — it points at the same DM Sans chain as `font-sans` so
        // existing components are unaffected. Adding the alias keeps the
        // CJK helper readable: `cjkClassName(s) → "font-cjk" | "font-body"`.
        body: ["DM Sans", "system-ui", "sans-serif"],
        // CJK fallback chain. `lib/cjk.ts` switches surfaces with mixed CN/EN
        // text (dealer/customer/warehouse names) to this family so glyphs
        // render cleanly. Noto Sans SC also covers Latin so ASCII stays sharp.
        cjk: ['"Noto Sans SC"', "DM Sans", "system-ui", "sans-serif"],
        stencil: ["Big Shoulders Stencil Display", "DM Sans", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
