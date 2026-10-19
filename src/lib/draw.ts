// Drawing keys with the device's own code (deck.renderKey), handing it the
// config's images and fonts whenever they change.

import type { Button } from "./config";
import type { Deck, Pixels } from "./deck";
import type { Doc } from "./doc.svelte";

let assets = "";

// assetsKey changes when images or fonts do. Sizes stand in for contents:
// comparing megabytes of base64 on every redraw would be slow.
function assetsKey(doc: Doc): string {
  const c = doc.config;
  const sizes = (m: Record<string, string> = {}) => Object.entries(m).map(([id, v]) => `${id}:${v.length}`);
  return [doc.loads, ...sizes(c?.images), "|", ...sizes(c?.fonts)].join(",");
}

export function drawKey(deck: Deck, doc: Doc, key: number, b: Button, on = false): Pixels | null {
  const k = assetsKey(doc);
  if (k !== assets && doc.config) {
    deck.setAssets(doc.config);
    assets = k;
  }
  return deck.renderKey(key, b, on);
}
