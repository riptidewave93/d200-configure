import { describe, expect, it } from "vitest";
import type { Config } from "./config";
import { forDevice, hasCommand, newer, older, runnable, unsupported, unsupportedMessage, type Features } from "./features";

const site: Features = {
  actions: ["app", "hid-key", "macro", "page"],
  fields: ["action.app", "action.args", "action.fallback", "action.keys", "action.op", "action.page", "action.steps", "action.type",
    "button.action", "button.font", "button.label", "button.on", "config.fonts", "config.home", "config.pages", "config.version",
    "look.label", "page.keys"],
  keys: ["a", "f13"],
  modifiers: ["ctrl"],
  usages: ["mute"],
  systems: ["sleep"],
  fonts: ["go-medium", "go-mono"],
  apps: { discord: ["mute", "deafen"], media: ["play-pause", "now-playing"] },
  args: { discord: ["id"], media: ["id", "show", "cycle"] },
  limits: { label: 32, label_lines: 3, font_bytes: 512 << 10 },
};

// an older device: no fonts, looks while on, fallbacks, f13, deafen or now-playing settings
const old: Features = {
  ...site,
  fields: site.fields.filter((f) => !["button.font", "button.on", "action.fallback", "config.fonts"].includes(f)),
  keys: ["a"],
  fonts: ["go-medium"],
  apps: { discord: ["mute"], media: ["play-pause", "now-playing"] },
  args: { discord: ["id"], media: ["id"] },
  limits: { label: 24, label_lines: 3 },
};

const config = (button: object, extra: object = {}): Config =>
  ({ version: 1, home: "main", pages: { main: { keys: { "0": button } } }, ...extra }) as Config;

describe("features", () => {
  it("offers what both the site and the device support", () => {
    const f = forDevice(site, old);
    expect(f.fields).not.toContain("button.on");
    expect(f.keys).toEqual(["a"]);
    expect(f.fonts).toEqual(["go-medium"]);
    expect(f.apps.discord).toEqual(["mute"]);
    expect(f.args.media).toEqual(["id"]);
    expect(f.limits).toEqual({ label: 24, label_lines: 3, font_bytes: 512 << 10 });
  });

  it("keeps the animation budget only for a device that reports it", () => {
    const s = { ...site, limits: { ...site.limits, anim_bytes: 8 << 20 } };
    expect(forDevice(s, old).limits.anim_bytes).toBeUndefined();
    expect(forDevice(s, { ...old, limits: { ...old.limits, anim_bytes: 4 << 20 } }).limits.anim_bytes).toBe(4 << 20);
  });

  it("takes a connected device that doesn't say as older: no anim_bytes", () => {
    const s = { ...site, limits: { ...site.limits, anim_bytes: 8 << 20 } };
    const f = forDevice(s, older(s));
    expect(f.limits.anim_bytes).toBeUndefined();
    expect({ ...f, limits: {} }).toEqual({ ...s, limits: {} });
    expect(f.limits.label).toBe(32);
  });

  it("knows the requests a device takes beyond the first release's", () => {
    expect(hasCommand({ ...site, commands: ["reset"] }, "reset")).toBe(true);
    expect(hasCommand(old, "reset")).toBe(false); // older software: no list
    expect(hasCommand(null, "reset")).toBe(false);
  });

  it("refuses a config bigger than the device takes", () => {
    const f = { ...site, limits: { ...site.limits, config_bytes: 2 << 20 } };
    const c = config({ label: "x", action: {} }, { images: { a: "x".repeat(2 << 20) } });
    expect(unsupported(c, f)).toContain("configs over 2 MB");
    expect(unsupported(config({ label: "x", action: {} }), f)).not.toContain("configs over 2 MB");
  });

  it("offers what the site supports with no device", () => {
    expect(forDevice(site, undefined)).toBe(site);
  });

  it("keeps an app the device doesn't know: the PC helper checks it", () => {
    const f = forDevice({ ...site, apps: { ...site.apps, obs: ["scene"] } }, old);
    expect(f.apps.obs).toEqual(["scene"]);
  });

  it("offers app actions the PC helper runs, while it's connected", () => {
    const host = { connected: true, apps: [{ name: "discord", title: "Discord", ops: ["deafen"] }] };
    const f = runnable(site, host);
    expect(f.apps.discord).toEqual(["deafen"]);
    expect(f.apps.media).toEqual([]);
    expect(runnable(site, { connected: false })).toBe(site);
  });

  it("knows a device newer than the site", () => {
    expect(newer(site, old)).toBe(false);
    expect(newer(site, { ...site, fields: [...site.fields, "button.glow"] })).toBe(true);
    expect(newer(site, undefined)).toBe(false);
  });

  it("says what a config uses that the device lacks", () => {
    const f = forDevice(site, old);
    expect(unsupported(config({ label: "Hi", action: { type: "page", page: "main" } }), f)).toEqual([]);
    expect(unsupported(config({ label: "Hi", font: "go-mono", action: {} }), f)).toEqual(["fonts", "the font go-mono"]);
    expect(unsupported(config({ label: "x".repeat(30), action: {} }), f)).toEqual(["labels over 24 characters"]);
    expect(
      unsupported(config({ action: { type: "macro", steps: [{ type: "hid-key", keys: ["Ctrl", "F13"] }] } }), f),
    ).toEqual(["the key f13"]);
    expect(
      unsupported(
        config({ action: { type: "app", app: "discord", op: "deafen", fallback: { type: "hid-key", keys: ["a"] } }, on: { label: "x" } }),
        f,
      ),
    ).toEqual(["looks while on", "keys that do something else without the PC helper", "Discord: Deafen"]);
    expect(
      unsupported(config({ action: { type: "app", app: "media", op: "now-playing", args: { show: "both" } } }), f),
    ).toEqual(['Media player setting "show"']);
    expect(unsupported(config({ action: { type: "launch" } }), f)).toEqual(['"Open program" keys']);
  });

  it("explains it in a sentence", () => {
    const f = forDevice(site, old);
    expect(unsupportedMessage(config({ action: {} }), f)).toBe("");
    expect(unsupportedMessage(config({ action: {}, on: {} }), f)).toBe(
      "This device's software doesn't support looks while on. Update it, or remove it.",
    );
    expect(unsupportedMessage(config({ font: "go-mono", action: {}, on: {} }), f)).toBe(
      "This device's software doesn't support fonts, looks while on and the font go-mono. Update it, or remove them.",
    );
    expect(unsupportedMessage(config({ font: "go-mono", label: "x".repeat(30), action: { type: "launch" }, on: {} }), f)).toBe(
      "This device's software doesn't support fonts, looks while on, the font go-mono and 2 more. Update it, or remove them.",
    );
  });
});
