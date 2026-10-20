// Drawing keys with the device's own code (deck.renderKey), handing it the
// config whenever what keys are drawn from changes: icons, images, fonts.

import type { Button } from "./config";
import type { Deck, Pixels } from "./deck";
import type { Doc } from "./doc.svelte";

let assets = "";
let page = "";

// assetsKey changes when what keys are drawn from does: the icons keys
// name (their own, their on looks, and app looks), the config's icons,
// images and fonts. Sizes stand in for contents: comparing megabytes of
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
  return [doc.loads, ...names, "|", ...sizes(c.icons), "|", ...sizes(c.images), "|", ...sizes(c.fonts)].join(",");
}

export function drawKey(deck: Deck, doc: Doc, key: number, b: Button, on = false): Pixels | null {
  const k = assetsKey(doc);
  if (k !== assets && doc.config) {
    deck.setAssets(doc.config);
    assets = k;
  }
  if (doc.page !== page) {
    deck.newPage();
    page = doc.page;
  }
  return deck.renderKey(key, b, on);
}
