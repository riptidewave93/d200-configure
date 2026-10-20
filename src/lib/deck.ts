// d200-deck's config and drawing code, run as WebAssembly (see wasm/main.go):
// checks a config and draws keys exactly as the device does.

import "../wasm/wasm_exec.js";
import wasmURL from "../wasm/deck.wasm?url";
import type { Action, Button, Config, IconEntry, Look } from "./config";
import type { Layout } from "./layout";

export interface Names {
  keys: string[];
  modifiers: string[];
  usages: string[];
  systems: string[];
  fonts: string[];
  apps: Record<string, string[]>;
}

// RGBA pixels, as in ImageData
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
  // when the key's animation shows its next frame (ms since 1970), or 0
  next: number;
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

export interface ImageInfo {
  width: number;
  height: number;
  frames: number;
}

export interface Deck {
  // validate is "" for a valid config, else why it isn't
  validate(config: Config | string): string;
  // embed works out the icons a config's keys can show: those it has, and
  // the rest from the catalog. unknown are names found in neither.
  embed(config: Config): { icons: Record<string, IconEntry>; unknown: string[] };
  // setAssets gives the config keys are drawn from (its icons, images and
  // fonts); it returns the icon names it lacks
  setAssets(config: Config): string[];
  // renderKey draws key i as the device does; on draws its look while on
  renderKey(i: number, b: Button, on?: boolean): Pixels | null;
  // fitImage scales a picture down to width x height and maxBytes, as the
  // device needs; it throws why it can't
  fitImage(b: Uint8Array, width: number, height: number, maxBytes: number): Fitted;
  imageInfo(base64: string): ImageInfo | null;
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
  names: Names;
  icons: string[];
  hasIcon(name: string): boolean; // in the catalog
  iconPath(name: string): IconPath | null;
  defaultConfig(): Config;
}

export interface IconPath {
  d: string;
  viewBox: string;
}

interface Exports {
  validate(json: string): string;
  embed(json: string): string;
  setAssets(json: string): string;
  renderKey(i: number, json: string, on: boolean): Pixels | null;
  fitImage(b: Uint8Array, width: number, height: number, maxBytes: number): string;
  imageInfo(base64: string): string;
  newPage(): void;
  missingGlyphs(json: string): string;
  checkFont(b: Uint8Array): string;
  subsetFont(b: Uint8Array, text: string): string;
  fontLacks(base64: string, text: string): string;
  builtinFallback(json: string): string;
  layout: string;
  iconNames: string;
  iconPath(name: string): IconPath | null;
  names: string;
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
  const icons: string[] = JSON.parse(x.iconNames);
  const iconSet = new Set(icons);
  return {
    validate: (c) => x.validate(typeof c === "string" ? c : JSON.stringify(c)),
    embed: (c) => {
      const r = JSON.parse(x.embed(JSON.stringify(c)));
      if (r.error) throw new Error(r.error);
      return { icons: r.icons ?? {}, unknown: r.unknown };
    },
    setAssets: (c) => {
      const r = JSON.parse(x.setAssets(JSON.stringify(c)));
      if (r.error) throw new Error(r.error);
      return r.unknown;
    },
    renderKey: (i, b, on = false) => x.renderKey(i, JSON.stringify(b), on),
    fitImage: (b, w, h, max) => {
      const r = JSON.parse(x.fitImage(b, w, h, max));
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
    imageInfo: (s) => {
      const r = JSON.parse(x.imageInfo(s));
      return r.error ? null : r;
    },
    layout: JSON.parse(x.layout),
    icons,
    hasIcon: (name) => iconSet.has(name),
    iconPath: (name) => x.iconPath(name),
    names: JSON.parse(x.names),
    defaultConfig: () => JSON.parse(x.defaultConfig),
  };
}
