/**
 * Color utilities for SC 2.4.7 / 2.4.13 contrast repair.
 *
 * Implements WCAG 2.1 relative luminance + contrast ratio per
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *
 * Supported input formats:
 *   - #rgb / #rrggbb
 *   - rgb(r,g,b) / rgba(r,g,b,a)
 *   - hsl(...) / hsla(...)   (computed-style output uses rgb but a few sites use hsl)
 *   - named colors via a tiny built-in lookup (most common ~16 names)
 */

const NAMED = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  lime: "#00ff00",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  maroon: "#800000",
  olive: "#808000",
  green: "#008000",
  purple: "#800080",
  teal: "#008080",
  navy: "#000080",
  transparent: null,
};

export function parseColor(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (s in NAMED) return NAMED[s] === null ? null : parseColor(NAMED[s]);
  if (s.startsWith("#")) return parseHex(s);
  if (s.startsWith("rgb")) return parseRgb(s);
  if (s.startsWith("hsl")) return parseHsl(s);
  return null;
}

function parseHex(s) {
  let hex = s.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length !== 6 && hex.length !== 8) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function parseRgb(s) {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => p.trim());
  if (parts.length < 3) return null;
  const r = clampByte(parseFloat(parts[0]));
  const g = clampByte(parseFloat(parts[1]));
  const b = clampByte(parseFloat(parts[2]));
  const a = parts[3] != null ? parseFloat(parts[3]) : 1;
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b, a };
}

function parseHsl(s) {
  const m = s.match(/hsla?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1]
    .split(",")
    .map((p) => p.trim().replace("%", "").replace("deg", ""));
  if (parts.length < 3) return null;
  const h = ((parseFloat(parts[0]) % 360) + 360) % 360;
  const sPct = parseFloat(parts[1]) / 100;
  const lPct = parseFloat(parts[2]) / 100;
  const a = parts[3] != null ? parseFloat(parts[3]) : 1;
  const { r, g, b } = hslToRgb(h, sPct, lPct);
  return { r, g, b, a };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function clampByte(n) {
  if (Number.isNaN(n)) return n;
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function relativeLuminance({ r, g, b }) {
  const conv = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * conv(r) + 0.7152 * conv(g) + 0.0722 * conv(b);
}

export function contrastRatio(c1, c2) {
  if (!c1 || !c2) return null;
  const L1 = relativeLuminance(c1);
  const L2 = relativeLuminance(c2);
  const [lighter, darker] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}

export function toHex({ r, g, b }) {
  return (
    "#" +
    [r, g, b]
      .map((n) => clampByte(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Find a color adjacent to `target` that achieves at least `minRatio` contrast
 * against `bg`. Walks toward black/white depending on which side of bg the target
 * sits, in 16 binary-search steps. Returns null if no solution found (e.g. bg is
 * mid-gray and minRatio is unattainable).
 */
export function adjustColorForContrast(target, bg, minRatio = 3.0) {
  if (!target || !bg) return null;
  const bgL = relativeLuminance(bg);
  const startL = relativeLuminance(target);
  // Walk away from bg. If target is darker than bg → walk toward black; else white.
  const dir = startL <= bgL ? -1 : 1;
  const endpoint = dir < 0 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  let lo = 0,
    hi = 1,
    best = null;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const r = Math.round(target.r + (endpoint.r - target.r) * t);
    const g = Math.round(target.g + (endpoint.g - target.g) * t);
    const b = Math.round(target.b + (endpoint.b - target.b) * t);
    const candidate = { r, g, b, a: 1 };
    const ratio = contrastRatio(candidate, bg);
    if (ratio >= minRatio) {
      best = candidate;
      hi = t;
    } else {
      lo = t;
    }
  }
  if (best) return best;
  // Fall back to endpoint and check.
  if (contrastRatio(endpoint, bg) >= minRatio) return { ...endpoint, a: 1 };
  return null;
}
