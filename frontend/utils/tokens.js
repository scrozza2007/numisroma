/**
 * NumisRoma — Design tokens. Warm light palette throughout; no dark surfaces.
 * Amber is the sole accent. Coin images use mix-blend-multiply so white photo
 * backgrounds dissolve into the warm parchment — coins appear to float.
 */

export const C = {
  // ── Warm light surfaces (all pages) ──────────────────────────
  canvas:      '#fdf8f0',   // page background
  surface:     '#faf4ea',   // nav, footer, subtle section bg
  surfaceAlt:  '#f5ede0',   // alternate section bg / footer
  card:        '#fefcf8',   // card / panel surface

  // ── Borders ───────────────────────────────────────────────────
  border:       '#e8e0d0',  // standard border on light surfaces
  borderStrong: '#d8cdb8',  // stronger / emphasis border

  // ── Brand accent ──────────────────────────────────────────────
  amber:       '#b8843a',   // CTAs, labels, focus rings, active states
  amberHover:  '#9a6e2e',   // amber on hover
  amberBg:     '#f0e8d4',   // amber-tinted light bg (selected states)
  amberLight:  '#e8d8b0',   // lighter amber fill

  // ── Text (warm brown tones, no neutral grays) ─────────────────
  textPrimary:   '#2e2820', // headings, primary body
  textSecondary: '#5a5040', // secondary content
  textMuted:     '#9a8e80', // placeholders, minor labels

  // ── Legacy aliases — kept for backward compat with inline styles ──
  // These map old names to new values so call sites needn't all change.
  ivory:       '#fdf8f0',   // → canvas
  cream:       '#fefcf8',   // → card
  ivoryAlt:    '#f5ede0',   // → surfaceAlt
  ivoryBorder: '#e8e0d0',   // → border
  gold:        '#b8843a',   // → amber
  goldHover:   '#9a6e2e',   // → amberHover
  goldBg:      '#f0e8d4',   // → amberBg
  ink:         '#2e2820',   // → textPrimary (used as CTA text contrast)
  inkBorder:   '#e8e0d0',   // → border
};

/** Semantic state colours for banners, toasts, and inline indicators. */
export const semantic = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#059669' },
  error:   { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
  warning: { bg: '#f0e8d4', border: '#b8843a', text: '#9a6e2e' },
};
