/* DEV ONLY — the artifact build serves the Noto files beside the page (the
   published page may not fetch from a font CDN). */
import { Font } from "@react-pdf/renderer";
export const NOTO_SANS_SC_FAMILY = "Noto Sans SC";
let registered = false;
export function registerNotoSansSC(): void {
  if (registered) return;
  const u = (w: number) => new URL(`fonts/noto-${w}.ttf`, window.location.href).href;
  Font.register({ family: NOTO_SANS_SC_FAMILY, fonts: [400, 500, 600, 700].map((w) => ({ src: u(w), fontWeight: w })) });
  registered = true;
}
