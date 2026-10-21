// Drawing keys with the device's own code (deck.renderKey), handing it the
// config whenever what keys are drawn from changes: icons, images, fonts.

import type { Button } from "./config";
import type { Deck, Pixels } from "./deck";
import type { Doc } from "./doc.svelte";
import { embedIcons, iconsReady } from "./icons.svelte";

let assets = "";
let page = "";

// assetsKey changes when what keys are drawn from does: the icons keys
// name (their own, their on looks, and app looks), the config's icons,
// images and fonts, and the catalog once it's loaded. Sizes stand in for contents: comparing megabytes of
// base64 on every redraw would be slow.
function assetsKey(doc: Doc): string {
  const c = doc.config;
  if (!c) return "";
  const sizes = (m: Record<string, unknown> = {}) =>
    Object.entries(m).map(([id, v]) => `${id}:${JSON.stringify(v).length}`);
  const names: string[] = [];
  for (const p of Object.values(c.pages)) {
    for (const b of Object.values(p.keys)) {
      names.push(b.icon ?? "", b.on?.icon ?? "", b.action?.type === "app" ? `${b.action.app}.${b.action.op}` : "");
    }
  }
  return [doc.loads, iconsReady(), ...names, "|", ...sizes(c.icons), "|", ...sizes(c.images), "|", ...sizes(c.fonts)].join(",");
}

export function drawKey(deck: Deck, doc: Doc, key: number, b: Button, on = false): Pixels | null {
  const k = assetsKey(doc);
  if (k !== assets && doc.config) {
    // the icons keys show that the config lacks come from the catalog;
    // while it loads they're drawn without
    const icons = embedIcons(deck, doc.config)?.icons ?? doc.config.icons;
    deck.setAssets({ ...doc.config, icons });
    assets = k;
  }
  if (doc.page !== page) {
    deck.newPage();
    page = doc.page;
  }
  if (isNowPlaying(b, on)) return dim(deck.renderKey(key, { ...b, label: "Now\nplaying" }, on));
  return deck.renderKey(key, b, on);
}

// A now-playing key with nothing set on it is blank until the PC helper
// sends a song, so the preview shows a dim placeholder instead.
function isNowPlaying(b: Button, on: boolean): boolean {
  const a = b.action;
  return !on && a?.type === "app" && a.app === "media" && a.op === "now-playing" && !b.icon && !b.image && !b.label;
}

function dim(px: Pixels | null): Pixels | null {
  if (!px) return px;
  for (let i = 0; i < px.data.length; i += 4) {
    px.data[i] *= 0.4;
    px.data[i + 1] *= 0.4;
    px.data[i + 2] *= 0.4;
  }
  return px;
}
