import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { load } from "./deck";

const deck = () => load(readFileSync(new URL("../wasm/deck.wasm", import.meta.url)));

describe("deck (WebAssembly)", () => {
  it("accepts the default config", async () => {
    const d = await deck();
    expect(d.validate(d.defaultConfig())).toBe("");
  });

  it("says why a config isn't valid", async () => {
    const d = await deck();
    const c = { version: 1, home: "main", pages: { main: { keys: { "0": { action: { type: "page", page: "nope" } } } } } };
    expect(d.validate(c)).toBe('page "main" key 0: page "nope" does not exist');
  });

  it("draws keys at their size", async () => {
    const d = await deck();
    expect(d.layout.keys).toHaveLength(14);
    const small = d.renderKey(0, { label: "Hi", background: "#ff0000", action: {} })!;
    expect([small.width, small.height]).toEqual([196, 196]);
    expect([...small.data.slice(0, 4)]).toEqual([255, 0, 0, 255]); // the background, in a corner
    const wide = d.renderKey(13, { icon: "mic", action: {} })!;
    expect([wide.width, wide.height]).toEqual([d.layout.keys[13].w, d.layout.keys[13].h]);
    expect(d.renderKey(14, { action: {} })).toBeNull();
  });

  it("draws a key whose action doesn't parse yet", async () => {
    const d = await deck();
    expect(d.renderKey(0, { label: "Hi", action: { type: "hid-consumer", usage: "nope" } })).not.toBeNull();
  });

  it("has the icons", async () => {
    const d = await deck();
    expect(d.icons.length).toBeGreaterThan(3000);
    expect(d.hasIcon("volume_up") && d.hasIcon("play-pause")).toBe(true);
    expect(d.hasIcon("nope")).toBe(false);
    expect(d.iconPath("volume_up")).toMatchObject({ viewBox: "0 -960 960 960" });
    expect(d.iconPath("nope")).toBeNull();
  });

  it("lists names", async () => {
    const { names } = await deck();
    expect(names.keys).toContain("f13");
    expect(names.modifiers).toContain("ctrl");
    expect(names.usages).toContain("play-pause");
    expect(names.apps.discord).toContain("mute");
  });
});
