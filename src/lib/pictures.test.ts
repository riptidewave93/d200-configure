import { readFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Config } from "./config";
import { load } from "./deck";
import { animBudget, animatedBytes, fitNote, oldAnimBudget, pictureID, share, usedImages } from "./pictures";

const deck = () => load(readFileSync(new URL("../wasm/deck.wasm", import.meta.url)));
const gif = readFileSync(new URL("./testdata/bars.gif", import.meta.url)); // 64x64, 4 frames

// png makes a solid opaque PNG.
function png(w: number, h: number): Uint8Array {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([200, 50, 50, 255], y * (w * 4 + 1) + 1 + x * 4);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([len, Buffer.from(type), data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

describe("pictures", () => {
  it("names pictures after their files", () => {
    expect(pictureID("My Cat (2).PNG", [])).toBe("my-cat-2");
    expect(pictureID("cat.png", ["cat", "cat-2"])).toBe("cat-3");
    expect(pictureID("🙂.gif", [], "pic-")).toBe("pic-picture");
  });

  it("says what fitting changed", () => {
    expect(fitNote({ data: "", width: 10, height: 10, frames: 1, dropped: 0, changed: false })).toBe("");
    expect(fitNote({ data: "", width: 196, height: 131, frames: 1, dropped: 0, changed: true })).toBe(
      "Made smaller to fit: 196×131.",
    );
    expect(fitNote({ data: "", width: 120, height: 120, frames: 50, dropped: 70, changed: true })).toBe(
      "Made smaller to fit: 120×120, 50 of 120 frames.",
    );
  });

  it("fits a big picture to a key, and keeps one that fits", async () => {
    const d = await deck();
    const big = d.fitImage(png(800, 400), 196, 196, 256 << 10, oldAnimBudget);
    expect([big.width, big.height, big.changed]).toEqual([196, 98, true]);
    const small = d.fitImage(gif, 196, 196, 256 << 10, oldAnimBudget);
    expect([small.width, small.frames, small.changed]).toEqual([64, 4, false]);
    expect(() => d.fitImage(new Uint8Array([1, 2, 3]), 196, 196, 1000, oldAnimBudget)).toThrow("not a PNG, JPEG or GIF image");
  });

  it("finds the images keys use, their on looks too", () => {
    const c: Config = {
      version: 1,
      home: "main",
      pages: { main: { keys: { "0": { image: "a", action: {} }, "1": { action: {}, on: { image: "b" } } } } },
      images: { a: "", b: "", c: "" },
    };
    expect([...usedImages(c)].sort()).toEqual(["a", "b"]);
  });

  it("counts what animates on older devices: 4 bytes a pixel", async () => {
    const d = await deck();
    const data = gif.toString("base64");
    const keys = Object.fromEntries([0, 1, 2].map((k) => [String(k), { image: "bars", action: {} }]));
    const c: Config = { version: 1, home: "main", pages: { main: { keys } }, images: { bars: data } };
    const b = animBudget({ label: 32 }); // no anim_bytes
    expect(b).toEqual(oldAnimBudget);
    expect(animatedBytes(c, d, "main", b)).toBe(4 * 196 * 196 * 4); // three keys, one size
    c.pages.main.keys["3"] = { image: "bars", label: "Hi", action: {} }; // with a label: 100 px
    expect(animatedBytes(c, d, "main", b)).toBe(4 * (196 * 196 + 100 * 100) * 4);
    expect(animatedBytes(c, d, "other", b)).toBe(0);
  });

  it("counts what animates on newer devices: a byte a pixel and a palette", async () => {
    const d = await deck();
    const data = gif.toString("base64");
    const c: Config = {
      version: 1,
      home: "main",
      pages: { main: { keys: { "0": { image: "bars", action: {} } } } },
      images: { bars: data },
    };
    const b = animBudget({ anim_bytes: 8 << 20 });
    expect(b).toEqual({ bytes: 8 << 20, perPixel: 1 });
    expect(animatedBytes(c, d, "main", b)).toBe(d.animBytes(data, 196, 196, 1));
    expect(d.animBytes(data, 196, 196, 1)).toBeGreaterThanOrEqual(4 * 196 * 196);
    expect(d.animBytes(data, 196, 196, 1)).toBeLessThan(4 * 196 * 196 * 2);
    // a picture icon shown while on: 120 px, counted too
    c.icons = { "pic-bars": { png: data } };
    c.pages.main.keys["1"] = { label: "Off", action: {}, on: { icon: "pic-bars", label: "" } };
    expect(animatedBytes(c, d, "main", b)).toBe(d.animBytes(data, 196, 196, 1) + d.animBytes(data, 100, 100, 1)); // its label stays: 100 px
    c.pages.main.keys["1"] = { action: {}, on: { icon: "pic-bars" } };
    expect(animatedBytes(c, d, "main", b)).toBe(d.animBytes(data, 196, 196, 1) + d.animBytes(data, 120, 120, 1));
    // leaving out a look being replaced
    expect(animatedBytes(c, d, "main", b, c.pages.main.keys["1"].on)).toBe(d.animBytes(data, 196, 196, 1));
  });

  it("shares the budget: what's left, or 2 frames", () => {
    const b = { bytes: 100000, perPixel: 1 } as const;
    expect(share(b, 30000, 100, 100).bytes).toBe(70000);
    expect(share(b, 95000, 100, 100).bytes).toBe(2 * 100 * 100 + 1024);
    expect(share(oldAnimBudget, 8 << 20, 100, 100).bytes).toBe(2 * 100 * 100 * 4);
  });

  it("finds label characters the device can't draw", async () => {
    const d = await deck();
    expect(d.missingGlyphs({ label: "Mute" })).toBe("");
    expect(d.missingGlyphs({ label: "Done ✓" })).toBe("✓");
  });

  it("previews say when an animation's next frame is due", async () => {
    const d = await deck();
    const c: Config = { version: 1, home: "main", pages: { main: { keys: {} } }, images: { bars: gif.toString("base64") } };
    d.setAssets(c);
    const still = d.renderKey(0, { label: "Hi", action: {} })!;
    expect(still.next).toBe(0);
    const moving = d.renderKey(0, { image: "bars", action: {} })!;
    expect(moving.next).toBeGreaterThan(Date.now() - 1000);
    expect(moving.next).toBeLessThan(Date.now() + 2000);
  });
});
