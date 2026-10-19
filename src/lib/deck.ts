// d200-deck's config and drawing code, run as WebAssembly (see wasm/main.go):
// checks a config and draws keys exactly as the device does.

import "../wasm/wasm_exec.js";
import wasmURL from "../wasm/deck.wasm?url";
import type { Button, Config, IconEntry } from "./config";
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
    layout: JSON.parse(x.layout),
    icons,
    hasIcon: (name) => iconSet.has(name),
    iconPath: (name) => x.iconPath(name),
    names: JSON.parse(x.names),
    defaultConfig: () => JSON.parse(x.defaultConfig),
  };
}
