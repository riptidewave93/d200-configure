// The icon picker's app logos (logos.json, by scripts/logos.mjs), and the
// colours a key gets with one.

// An app logo: its own path, or a device icon's name.
export interface Logo {
  name: string; // the icon's name
  title: string;
  hex: string; // #rrggbb
  group: string; // e.g. "Browsers"
  d?: string; // SVG path data, filled nonzero; none for a device icon
  viewBox?: string;
}

// loadLogos loads the logos, once.
let loaded: Promise<Logo[]> | null = null;
export function loadLogos(): Promise<Logo[]> {
  loaded ??= import("./logos.json").then((m) => m.default.logos as Logo[]);
  return loaded;
}

// The order of the picker's groups; others follow.
const groups = ["Browsers", "Chat", "Games", "Media", "Creative", "Work", "Code", "System"];

// grouped sorts logos into their groups, in the picker's order.
export function grouped(logos: Logo[]): { group: string; logos: Logo[] }[] {
  const out = new Map<string, Logo[]>();
  for (const l of logos) out.set(l.group, [...(out.get(l.group) ?? []), l]);
  const rank = (g: string) => (groups.includes(g) ? groups.indexOf(g) : groups.length);
  return [...out]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([group, logos]) => ({ group, logos }));
}

// A key's background when it has none of its own.
export const keyBackground = "#1c1c1c";

// contrast is the WCAG contrast ratio of two #rrggbb colours, 1 to 21.
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// brandColours are a key's colours for a logo: the brand colour on the
// key's background if it reads there, else white on the brand colour (black
// on a light one). A near-black brand keeps the key's background, so the key
// still stands out from the black screen.
export function brandColours(hex: string, background = keyBackground): { color: string; background?: string } {
  if (contrast(hex, background) >= 3) return { color: hex };
  if (contrast(hex, "#000000") < 1.5) return { color: "#ffffff" };
  return { color: contrast("#ffffff", hex) >= 3 ? "#ffffff" : "#000000", background: hex };
}
