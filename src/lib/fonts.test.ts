import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "./config";
import { load } from "./deck";
import {
  addCatalogFont,
  addFontFile,
  catalogFonts,
  fontID,
  fontName,
  fontText,
  growFonts,
  toBase64,
  trimFonts,
  unwoff,
} from "./fonts";

const deck = () => load(readFileSync(new URL("../wasm/deck.wasm", import.meta.url)));
const goRegular = new Uint8Array(readFileSync(new URL("../wasm/Go-Regular.ttf", import.meta.url)));

const config = (keys: Config["pages"][string]["keys"]): Config => ({ version: 1, home: "main", pages: { main: { keys } } });

// catalog fonts load from public/fonts, as the site serves them
function serveCatalog() {
  vi.stubGlobal("fetch", async (url: string) => {
    const name = url.split("/").pop()!;
    return new Response(readFileSync(new URL(`../../public/fonts/${name}`, import.meta.url)));
  });
}
afterEach(() => vi.unstubAllGlobals());

// woff packs a TrueType font as WOFF, its tables deflated
async function woff(ttf: Uint8Array): Promise<Uint8Array> {
  const v = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const n = v.getUint16(4);
  const parts: Uint8Array[] = [];
  const dir = new Uint8Array(44 + 20 * n);
  const d = new DataView(dir.buffer);
  let pos = dir.length;
  for (let i = 0; i < n; i++) {
    const r = 12 + 16 * i;
    const [tag, sum, off, len] = [0, 4, 8, 12].map((o) => v.getUint32(r + o));
    const raw = ttf.subarray(off, off + len);
    const z = new Uint8Array(await new Response(new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
    const data = z.length < len ? z : raw;
    [tag, pos, data.length, len, sum].forEach((x, j) => d.setUint32(44 + 20 * i + 4 * j, x));
    const padded = new Uint8Array((data.length + 3) & ~3);
    padded.set(data);
    parts.push(padded);
    pos += padded.length;
  }
  d.setUint32(0, 0x774f4646); // wOFF
  d.setUint32(4, v.getUint32(0));
  d.setUint32(8, pos);
  d.setUint16(12, n);
  const out = new Uint8Array(pos);
  out.set(dir);
  let at = dir.length;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
}

describe("fonts", () => {
  it("collects the characters labels in a font use", () => {
    const c = config({
      "0": { label: "Mute\nMic", font: "f", action: {} },
      "1": { label: "Cam", action: {}, on: { label: "On!", font: "f" } },
      "2": { label: "Zzz", font: "g", action: {} },
    });
    expect(fontText(c, "f")).toBe(" !CMOaceimntu");
    expect(fontText(c, "f", "é")).toContain("é");
    expect(fontText(c, "h")).toBe(" ");
  });

  it("names fonts from files unlike the catalog's", () => {
    expect(fontID("Inter.ttf", [])).toBe("inter-2");
    expect(fontID("My Font.otf", ["my-font"])).toBe("my-font-2");
    expect(catalogFonts.every((f) => /^[a-z0-9-]+$/.test(f.id))).toBe(true);
  });

  it("cuts a font down, and finds what it lacks", async () => {
    const d = await deck();
    expect(d.checkFont(goRegular)).toBe("");
    const small = d.subsetFont(goRegular, " Hi");
    expect(atob(small).length).toBeLessThan(goRegular.length / 10);
    expect(d.fontLacks(small, "Hi there")).toBe("ther");
    expect(d.fontLacks(toBase64(goRegular), "Hi there")).toBe("");
  });

  it("unpacks WOFF", async () => {
    const d = await deck();
    const ttf = await unwoff(await woff(goRegular));
    expect(d.checkFont(ttf)).toBe("");
    expect(d.fontLacks(toBase64(ttf), "Hello")).toBe("");
  });

  it("adds a catalog font cut to its labels, grows it, and drops it unused", async () => {
    serveCatalog();
    const d = await deck();
    const c = config({ "0": { label: "AB", action: {} } });
    await addCatalogFont(d, c, "bebas-neue", "AB");
    c.pages.main.keys["0"].font = "bebas-neue";
    expect(d.fontLacks(c.fonts!["bebas-neue"], "AB")).toBe("");
    expect(d.fontLacks(c.fonts!["bebas-neue"], "ABC")).toBe("C");
    expect(d.validate(c)).toBe("");

    c.pages.main.keys["0"].label = "ABC";
    await growFonts(d, c);
    expect(d.fontLacks(c.fonts!["bebas-neue"], "ABC")).toBe("");

    delete c.pages.main.keys["0"].font;
    trimFonts(d, c);
    expect(c.fonts).toBeUndefined();
  });

  it("keeps a font file whole when it fits", async () => {
    const d = await deck();
    const c = config({});
    const { id, cut } = await addFontFile(d, c, new File([goRegular], "Go Regular.ttf"), "Hi");
    expect([id, cut]).toEqual(["go-regular-2", false]);
    expect(c.fonts![id]).toBe(toBase64(goRegular));
    await expect(addFontFile(d, c, new File(["nope"], "x.ttf"), "")).rejects.toThrow();
  });
});

describe("font names", () => {
  it("names fonts for people", () => {
    expect(fontName("go-bold")).toBe("Go Bold");
    expect(fontName("go-mono-bold-italic")).toBe("Go Mono Bold Italic");
    expect(fontName("go-smallcaps")).toBe("Go Small Caps");
    expect(fontName("inter-bold")).toBe("Inter Bold");
    expect(fontName("brand")).toBe("brand");
  });
});
