// The icon catalog (icons.json, by `make icons` from d200-deck's icons
// package), loaded the first time it's needed, and embedding: giving a
// config the icons its keys can show, as the device needs.

import type { Config, IconEntry } from "./config";
import type { Deck, IconPath } from "./deck";

interface Catalog {
  source: string;
  viewBox: string; // for icons given as path data alone
  icons: Record<string, string | IconPath>;
}

let data = $state.raw<Catalog | null>(null);
let loading: Promise<void> | null = null;
let sorted: string[] = [];

// loadIcons loads the catalog, once.
export function loadIcons(): Promise<void> {
  loading ??= import("./icons.json").then((m) => {
    const c = m.default as Catalog;
    sorted = Object.keys(c.icons).sort();
    data = c;
  });
  return loading;
}

// iconsReady says the catalog is loaded; reading it in an effect or derived
// value runs it again once it is.
export const iconsReady = () => data !== null;

// iconNames lists the catalog's icons, sorted; none until it's loaded.
export const iconNames = (): string[] => (data ? sorted : []);

export const hasIcon = (name: string) => !!data && Object.hasOwn(data.icons, name);

// iconPath is a catalog icon, or null (also while the catalog loads).
export function iconPath(name: string): IconPath | null {
  if (!data || !Object.hasOwn(data.icons, name)) return null;
  const ic = data.icons[name];
  return typeof ic === "string" ? { d: ic, viewBox: data.viewBox } : ic;
}

// embedIcons gives the icons c's keys can show, from its own and the
// catalog, and the names found in neither. It's null while the catalog is
// needed and loading (and starts loading it).
export function embedIcons(deck: Deck, c: Config): { icons: Record<string, IconEntry>; unknown: string[] } | null {
  const icons: Record<string, IconEntry> = {};
  const unknown: string[] = [];
  for (const n of deck.iconsUsed(c)) {
    const own = c.icons?.[n];
    if (own) {
      icons[n] = own;
      continue;
    }
    if (!data) {
      loadIcons();
      return null;
    }
    const ic = iconPath(n);
    if (ic) icons[n] = ic;
    else unknown.push(n);
  }
  return { icons, unknown };
}

// embedAll is embedIcons, waiting for the catalog if it's needed.
export async function embedAll(deck: Deck, c: Config): Promise<{ icons: Record<string, IconEntry>; unknown: string[] }> {
  const r = embedIcons(deck, c);
  if (r) return r;
  await loadIcons();
  return embedIcons(deck, c)!;
}
