// Fonts for labels: the catalog the site offers, and fonts from files. The
// config has little room, so a catalog font goes in cut down to the
// characters its labels use (deck.subsetFont), and is cut again from the
// whole font as labels change. A font from a file goes in whole if it fits,
// else cut down the same way while the page is open.

import { MaxFontBytes, type Config } from "./config";
import type { Deck } from "./deck";
import catalog from "./fontcatalog.json";
import { pictureID } from "./pictures";

export interface CatalogFont {
  id: string;
  name: string;
  family: string;
  weight: number;
  license: string; // its folder in github.com/google/fonts
}

export const catalogFonts: CatalogFont[] = catalog;
export const catalogFont = (id: string) => catalogFonts.find((f) => f.id === id);
export const fontName = (id: string) => catalogFont(id)?.name ?? id;

// The whole fonts that cut-down fonts in the config come from, by ID.
const sources = new Map<string, Uint8Array>();
// The characters last found missing from a font, so they're looked for once.
const tried = new Map<string, string>();

async function catalogSource(id: string): Promise<Uint8Array> {
  let b = sources.get(id);
  if (b) return b;
  const r = await fetch(`${import.meta.env.BASE_URL}fonts/${id}.ttf`).catch(() => null);
  if (!r?.ok) throw new Error("The font didn't load. Check the connection and try again.");
  b = new Uint8Array(await r.arrayBuffer());
  sources.set(id, b);
  return b;
}

// fontText is every character the labels in font id use, once each, and a
// space. extra adds a label not in the config yet.
export function fontText(c: Config, id: string, extra = ""): string {
  const chars = new Set([" ", ...extra]);
  const add = (s?: string) => {
    for (const ch of s ?? "") chars.add(ch);
  };
  for (const p of Object.values(c.pages)) {
    for (const b of Object.values(p.keys)) {
      // a key's on look takes its font and label when it has none of its own
      if (b.font === id) {
        add(b.label);
        if (b.on && !b.on.font) add(b.on.label);
      }
      if (b.on?.font === id) {
        add(b.on.label);
        add(b.label);
      }
    }
  }
  chars.delete("\n");
  return [...chars].sort().join("");
}

export function usedFonts(c: Config): Set<string> {
  const used = new Set<string>();
  for (const p of Object.values(c.pages)) {
    for (const b of Object.values(p.keys)) {
      if (b.font) used.add(b.font);
      if (b.on?.font) used.add(b.on.font);
    }
  }
  return used;
}

// addCatalogFont puts catalog font id in the config, cut down to its labels
// and extra.
export async function addCatalogFont(deck: Deck, c: Config, id: string, extra: string) {
  const b = await catalogSource(id);
  (c.fonts ??= {})[id] = deck.subsetFont(b, fontText(c, id, extra));
}

// addFontFile puts a font file in the config, whole if it fits, and gives
// its ID. It throws why the font can't be used.
export async function addFontFile(deck: Deck, c: Config, f: File, extra: string): Promise<{ id: string; cut: boolean }> {
  const b = await readFontFile(f);
  const id = fontID(f.name, [...Object.keys(c.fonts ?? {}), ...deck.features.fonts]);
  if (b.length <= MaxFontBytes) {
    const why = deck.checkFont(b);
    if (why) throw new Error(why);
    (c.fonts ??= {})[id] = toBase64(b);
    return { id, cut: false };
  }
  let data: string;
  try {
    data = deck.subsetFont(b, fontText(c, id, extra));
  } catch (err) {
    if ((err as { notTrueType?: boolean }).notTrueType)
      throw new Error("it's over 512 KB, and only TrueType fonts can be made smaller");
    throw err;
  }
  sources.set(id, b);
  (c.fonts ??= {})[id] = data;
  return { id, cut: true };
}

// growFonts adds the characters labels have gained to cut-down fonts.
export async function growFonts(deck: Deck, c: Config) {
  for (const [id, data] of Object.entries(c.fonts ?? {})) {
    const text = fontText(c, id);
    const lacks = deck.fontLacks(data, text);
    if (!lacks || tried.get(id) === lacks) continue;
    if (!sources.has(id) && !catalogFont(id)) continue;
    tried.set(id, lacks);
    const b = sources.get(id) ?? (await catalogSource(id).catch(() => null));
    if (b && c.fonts?.[id] === data) c.fonts[id] = deck.subsetFont(b, fontText(c, id));
  }
}

// trimFonts drops the fonts no label uses, and cuts the cut-down ones to
// exactly what their labels use, for saving.
export function trimFonts(deck: Deck, c: Config) {
  if (!c.fonts) return;
  const used = usedFonts(c);
  for (const id of Object.keys(c.fonts)) {
    if (!used.has(id)) delete c.fonts[id];
    else if (sources.has(id)) c.fonts[id] = deck.subsetFont(sources.get(id)!, fontText(c, id));
  }
  if (!Object.keys(c.fonts).length) delete c.fonts;
}

// readFontFile gives a font file as TrueType or OpenType, unpacking WOFF.
export async function readFontFile(f: File): Promise<Uint8Array> {
  const b = new Uint8Array(await f.arrayBuffer());
  const tag = String.fromCharCode(...b.subarray(0, 4));
  if (tag === "wOFF") return unwoff(b);
  if (tag === "wOF2") throw new Error("WOFF2 files aren't supported; use the font's TTF or OTF file");
  if (tag === "ttcf") throw new Error("font collections aren't supported; use a single TTF or OTF file");
  return b;
}

// fontID names a font after its file, unlike the names in taken and the catalog's.
export function fontID(file: string, taken: Iterable<string>): string {
  return pictureID(file, [...taken, ...catalogFonts.map((f) => f.id)]);
}

async function inflate(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// unwoff turns a WOFF file back into the font it holds: its tables,
// inflated, behind a TrueType/OpenType header.
export async function unwoff(w: Uint8Array): Promise<Uint8Array> {
  const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
  const n = v.getUint16(12);
  const tables: { tag: number; sum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < n; i++) {
    const e = 44 + i * 20;
    const [tag, off, comp, orig, sum] = [0, 4, 8, 12, 16].map((o) => v.getUint32(e + o));
    const raw = w.subarray(off, off + comp);
    const data = comp < orig ? await inflate(raw) : raw;
    if (data.length !== orig) throw new Error("a broken WOFF file");
    tables.push({ tag, sum, data });
  }
  tables.sort((a, b) => a.tag - b.tag);
  const pad = (x: number) => (x + 3) & ~3;
  const out = new Uint8Array(tables.reduce((s, t) => s + pad(t.data.length), 12 + 16 * n));
  const o = new DataView(out.buffer);
  const sel = Math.floor(Math.log2(n));
  o.setUint32(0, v.getUint32(4)); // TrueType or OpenType
  o.setUint16(4, n);
  o.setUint16(6, 16 << sel);
  o.setUint16(8, sel);
  o.setUint16(10, n * 16 - (16 << sel));
  let pos = 12 + 16 * n;
  tables.forEach((t, i) => {
    [t.tag, t.sum, pos, t.data.length].forEach((x, j) => o.setUint32(12 + 16 * i + 4 * j, x));
    out.set(t.data, pos);
    pos += pad(t.data.length);
  });
  return out;
}

export function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
