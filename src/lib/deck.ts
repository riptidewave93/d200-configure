// d200-deck's config and drawing code, run as WebAssembly (see wasm/main.go):
// checks a config and draws keys exactly as the device does.

import "../wasm/wasm_exec.js";
import wasmURL from "../wasm/deck.wasm?url";
import type { Action, Button, Config, Look } from "./config";
import type { Features } from "./features";
import type { Layout } from "./layout";

// RGBA pixels, as in ImageData
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
  // when the key's animation shows its next frame (ms since 1970), or 0
  next: number;
}

// A page's budget for animated GIFs: bytes in all, frames kept perPixel
// bytes a pixel at the size drawn (see pictures.ts, animBudget).
export interface AnimBudget {
  bytes: number;
  perPixel: 1 | 4;
}

// A picture fitted to the device: base64 PNG, JPEG or GIF.
export interface Fitted {
  data: string;
  width: number;
  height: number;
  frames: number;
  dropped: number; // frames left out to fit
  changed: boolean; // false: it fit as it was
}

export interface Deck {
  // validate is "" for a valid config, else why it isn't
  validate(config: Config | string): string;
  // iconsUsed are the icons a config's keys can show, sorted: their own,
  // their on looks' and their actions' built-in looks
  iconsUsed(config: Config): string[];
  // setAssets gives the config keys are drawn from: its icons (see
  // embedIcons), images and fonts
  setAssets(config: Config): void;
  // renderKey draws key i as the device does; on draws its look while on
  renderKey(i: number, b: Button, on?: boolean): Pixels | null;
  // fitImage scales a picture down to width x height and maxBytes, and an
  // animated GIF to its share of the page's animation budget, as the device
  // needs; it throws why it can't
  fitImage(b: Uint8Array, width: number, height: number, maxBytes: number, anim: AnimBudget): Fitted;
  // animBytes is what a GIF drawn to fit width x height takes of a page's
  // animation budget, kept perPixel bytes a pixel; 0 if it's still
  animBytes(base64: string, width: number, height: number, perPixel: number): number;
  // pictureBox is the box a picture on key i is drawn to fit: an image or a
  // picture icon, beside a label or not
  pictureBox(i: number, image: boolean, label: boolean): [number, number] | null;
  // newPage says the preview shows another page: each has its own budget
  // of animated frames, as on the device
  newPage(): void;
  // missingGlyphs are the label characters the look's font lacks
  missingGlyphs(look: Look): string;
  // checkFont is "" for a font the device can use, else why not
  checkFont(b: Uint8Array): string;
  // subsetFont cuts a TrueType font down to the characters in text, as
  // base64; it throws why it can't, with notTrueType set for CFF fonts
  subsetFont(b: Uint8Array, text: string): string;
  // fontLacks are the characters of text a font (base64) has no glyph for
  fontLacks(base64: string, text: string): string;
  // builtinFallback is what the device does instead while the PC helper
  // can't run an app action, if it has something built in
  builtinFallback(a: Action): Action | null;
  layout: Layout;
  features: Features; // the site's own: what its copy of the device code supports
  defaultConfig(): Config;
}

export interface IconPath {
  d: string;
  viewBox: string;
}

interface Exports {
  validate(json: string): string;
  iconsUsed(json: string): string;
  setAssets(json: string): string;
  renderKey(i: number, json: string, on: boolean): Pixels | null;
  fitImage(b: Uint8Array, width: number, height: number, maxBytes: number, animBytes: number, perPixel: number): string;
  animBytes(base64: string, width: number, height: number, perPixel: number): number;
  pictureBox(i: number, image: boolean, label: boolean): [number, number] | null;
  newPage(): void;
  missingGlyphs(json: string): string;
  checkFont(b: Uint8Array): string;
  subsetFont(b: Uint8Array, text: string): string;
  fontLacks(base64: string, text: string): string;
  builtinFallback(json: string): string;
  layout: string;
  features: string;
  defaultConfig: string;
}

declare global {
  // set by wasm_exec.js
  var Go: new () => { importObject: WebAssembly.Imports; run(i: WebAssembly.Instance): Promise<void> };
  // set by the WebAssembly module
  var deck: Exports | undefined;
}

let loaded: Promise<Deck> | null = null;

// load starts the module once; code may be its bytes, for tests.
export function load(code?: BufferSource): Promise<Deck> {
  loaded ??= start(code);
  return loaded;
}

async function start(code?: BufferSource): Promise<Deck> {
  const go = new Go();
  const { instance } = code
    ? await WebAssembly.instantiate(code, go.importObject)
    : await WebAssembly.instantiateStreaming(fetch(wasmURL), go.importObject);
  go.run(instance); // runs until the page closes
  const x = globalThis.deck;
  if (!x) throw new Error("The config checker didn't start.");
  return {
    validate: (c) => x.validate(typeof c === "string" ? c : JSON.stringify(c)),
    iconsUsed: (c) => {
      const r = JSON.parse(x.iconsUsed(JSON.stringify(c)));
      if (r.error) throw new Error(r.error);
      return r.names;
    },
    setAssets: (c) => {
      const r = JSON.parse(x.setAssets(JSON.stringify(c)));
      if (r.error) throw new Error(r.error);
    },
    renderKey: (i, b, on = false) => x.renderKey(i, JSON.stringify(b), on),
    fitImage: (b, w, h, max, anim) => {
      const r = JSON.parse(x.fitImage(b, w, h, max, anim.bytes, anim.perPixel));
      if (r.error) throw new Error(r.error);
      return r;
    },
    newPage: () => x.newPage(),
    builtinFallback: (a) => JSON.parse(x.builtinFallback(JSON.stringify(a))),
    missingGlyphs: (l) => x.missingGlyphs(JSON.stringify({ ...l, action: {} })),
    checkFont: (b) => x.checkFont(b),
    subsetFont: (b, text) => {
      const r = JSON.parse(x.subsetFont(b, text));
      if (r.error) throw Object.assign(new Error(r.error), { notTrueType: !!r.notTrueType });
      return r.data;
    },
    fontLacks: (b64, text) => x.fontLacks(b64, text),
    animBytes: (s, w, h, p) => x.animBytes(s, w, h, p),
    pictureBox: (i, image, label) => x.pictureBox(i, image, label),
    layout: JSON.parse(x.layout),
    features: JSON.parse(x.features),
    defaultConfig: () => JSON.parse(x.defaultConfig),
  };
}
