import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Config } from "./config";
import { load } from "./deck";
import { loadLogos } from "./logos";

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

  it("starts a new config from the device's built-in one: valid, and a fresh copy each time", async () => {
    const d = await deck();
    const c = d.defaultConfig();
    expect(d.validate(c)).toBe("");
    expect(Object.keys(c.pages)).toContain(c.home);
    c.pages[c.home].keys = {};
    expect(Object.keys(d.defaultConfig().pages[c.home].keys).length).toBeGreaterThan(0);
  });

  it("knows what app keys do by themselves without the PC helper", async () => {
    const d = await deck();
    expect(d.builtinFallback({ type: "app", app: "discord", op: "mute" })).toEqual({
      type: "hid-key",
      keys: ["ctrl", "shift", "m"],
      mac_keys: ["gui", "shift", "m"],
    });
    expect(d.builtinFallback({ type: "app", app: "media", op: "next" })).toEqual({ type: "hid-consumer", usage: "next-track" });
    expect(d.builtinFallback({ type: "app", app: "obs", op: "scene" })).toBeNull();
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

  it("can draw every app logo", async () => {
    const d = await deck();
    const logos = await loadLogos();
    const c: Config = { version: 1, home: "p0", pages: {}, icons: {} };
    logos.forEach((l, i) => {
      // a logo with a path of its own mustn't hide a device icon
      expect(d.hasIcon(l.name), l.name).toBe(!l.d);
      if (l.d) c.icons![l.name] = { d: l.d, viewBox: l.viewBox };
      (c.pages[`p${Math.floor(i / 14)}`] ??= { keys: {} }).keys[String(i % 14)] = { icon: l.name, action: { type: "home" } };
    });
    c.icons = d.embed(c).icons;
    expect(d.validate(c)).toBe("");
  });

  it("embeds the icons keys show, and only those", async () => {
    const d = await deck();
    const c = {
      version: 1,
      home: "main",
      pages: {
        main: {
          keys: {
            "0": { icon: "volume_up", action: {} },
            "1": { icon: "emoji-1f3ae", action: {} },
            "2": { action: { type: "app", app: "discord", op: "mute" } },
            "3": { icon: "nope", action: {} },
          },
        },
      },
      icons: { "emoji-1f3ae": { png: "iVBORw0KGgo=" }, "emoji-1f600": { png: "iVBORw0KGgo=" } },
    };
    const { icons, unknown } = d.embed(c);
    expect(unknown).toEqual(["nope"]);
    expect(icons.volume_up.viewBox).toBe("0 -960 960 960");
    expect(icons["emoji-1f3ae"]).toEqual({ png: "iVBORw0KGgo=" }); // kept: a key uses it
    expect(icons["emoji-1f600"]).toBeUndefined(); // dropped: none does
    expect(icons.mic && icons.mic_off).toBeTruthy(); // Discord mute's built-in looks
  });

  it("draws keys whose icons aren't embedded yet", async () => {
    const d = await deck();
    const c = { version: 1, home: "main", pages: { main: { keys: { "0": { icon: "mic", action: {} } } } } };
    expect(d.setAssets(c)).toEqual([]);
    const px = d.renderKey(0, c.pages.main.keys["0"])!;
    // the icon is drawn: some pixels are the light foreground, not the background
    expect(px.data.some((v, i) => i % 4 === 0 && v > 200)).toBe(true);
  });

  it("lists what it supports", async () => {
    const { features } = await deck();
    expect(features.keys).toContain("f13");
    expect(features.modifiers).toContain("ctrl");
    expect(features.usages).toContain("play-pause");
    expect(features.apps.discord).toContain("mute");
    expect(features.fields).toContain("button.on");
    expect(features.limits.label).toBe(32);
  });

  it("refuses fields the device doesn't know, as the device does", async () => {
    const d = await deck();
    const c = { version: 1, home: "main", pages: { main: { keys: { "0": { label: "Hi", glow: true, action: {} } } } } };
    expect(d.validate(c)).toContain("pages.main.keys.0.glow: unknown field");
  });
});
