/**
 * Tag colours. A tag stores an optional `hue` (0..359); when it's null we derive
 * a stable hue from the name so every tag still gets a consistent colour. The
 * chip style is computed from the hue and works in both light and dark themes.
 * Shared by client and server.
 */
export function hueFromName(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function resolveHue(name: string, hue: number | null | undefined): number {
  return hue == null ? hueFromName(name) : ((hue % 360) + 360) % 360;
}

/** A curated set of hues for the colour picker (evenly spread around the wheel). */
export const HUE_SWATCHES = [4, 28, 52, 92, 140, 168, 200, 232, 262, 292, 322, 344];

/** Inline style for a tag chip at a given hue (theme-aware via oklch). */
export function chipStyle(hue: number): string {
  // Solid, medium-lightness fill with white text reads well on both themes.
  return `--tag-h:${hue}; background: oklch(58% 0.13 ${hue}); color: #fff;`;
}

/** Just the dot colour (for the sidebar list). */
export function dotStyle(hue: number): string {
  return `background: oklch(60% 0.15 ${hue});`;
}
