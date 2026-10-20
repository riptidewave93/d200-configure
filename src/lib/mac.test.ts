import { describe, expect, it } from "vitest";
import { describe as words } from "./actions";
import type { Action, Config } from "./config";
import type { Features } from "./features";
import { set } from "./edit";
import { browserOS, comboField, hostOS, macKeys, withoutMacKeys } from "./mac";

const features = (fields: string[], settings?: string[]) => ({ fields, settings }) as Features;
const newer = features(["action.keys", "action.mac_keys"], ["brightness", "host_os"]);
const older = features(["action.keys"]);

describe("mac", () => {
  it("tells a Mac from other computers", () => {
    expect(browserOS({ userAgentData: { platform: "macOS" } })).toBe("mac");
    expect(browserOS({ platform: "MacIntel" })).toBe("mac");
    expect(browserOS({ userAgentData: { platform: "Windows" }, platform: "Win32" })).toBe("other");
    expect(browserOS({ platform: "Linux x86_64" })).toBe("other");
    expect(browserOS(undefined)).toBe("other");
  });

  it("edits a Mac's own combo on a Mac, and keys everywhere else", () => {
    const both: Action = { type: "hid-key", keys: ["ctrl", "t"], mac_keys: ["gui", "t"] };
    const plain: Action = { type: "hid-key", keys: ["ctrl", "t"] };
    expect(comboField(both, "mac", true)).toBe("mac_keys");
    expect(comboField(plain, "mac", true)).toBe("keys"); // none of its own: keys, for every computer
    expect(comboField(both, "other", true)).toBe("keys");
    expect(comboField(both, "mac", false)).toBe("keys"); // older software: mac_keys ignored
    expect(words(both, "mac", true)).toBe("gui + t");
    expect(words(both, "other", true)).toBe("ctrl + t");
    expect(words(both, "mac", false)).toBe("ctrl + t");
  });

  it("edits one computer's combo without touching the other's", () => {
    const a: Action = { type: "hid-key", keys: ["ctrl", "t"], mac_keys: ["gui", "t"] };
    set(a, comboField(a, "mac", true), ["gui", "shift", "t"]);
    expect(a).toEqual({ type: "hid-key", keys: ["ctrl", "t"], mac_keys: ["gui", "shift", "t"] });
    set(a, comboField(a, "other", true), ["ctrl", "shift", "t"]);
    expect(a).toEqual({ type: "hid-key", keys: ["ctrl", "shift", "t"], mac_keys: ["gui", "shift", "t"] });
    // a new key has only keys: a Mac edits those, for every computer
    const b: Action = { type: "hid-key", keys: [] };
    set(b, comboField(b, "mac", true), ["gui", "c"]);
    expect(b).toEqual({ type: "hid-key", keys: ["gui", "c"] });
    // clearing a Mac's own combo leaves keys, which a Mac then shows
    set(a, comboField(a, "mac", true), []);
    expect(a).toEqual({ type: "hid-key", keys: ["ctrl", "shift", "t"] });
    expect(comboField(a, "mac", true)).toBe("keys");
  });

  it("knows which devices take Mac combos", () => {
    expect(macKeys(newer)).toBe(true);
    expect(macKeys(older)).toBe(false);
    expect(macKeys(null)).toBe(false);
  });

  it("leaves Mac combos out for older software, everywhere, without touching the config", () => {
    const c: Config = {
      version: 1,
      home: "main",
      pages: {
        main: {
          keys: {
            "0": { label: "Tab", action: { type: "hid-key", keys: ["ctrl", "t"], mac_keys: ["gui", "t"] } },
            "1": {
              action: {
                type: "macro",
                steps: [{ type: "hid-key", keys: ["ctrl", "c"], mac_keys: ["gui", "c"] }, { type: "delay", ms: 50 }],
              },
            },
            "2": { action: { type: "app", app: "discord", op: "mute", fallback: { type: "hid-key", keys: ["f13"], mac_keys: ["f14"] } } },
          },
        },
      },
    };
    const before = JSON.stringify(c);
    const out = JSON.stringify(withoutMacKeys(c));
    expect(out).not.toContain("mac_keys");
    expect(out).toContain('"keys":["ctrl","t"]');
    expect(out).toContain('"label":"Tab"');
    expect(JSON.stringify(c)).toBe(before);
  });

  it("tells the device which computer this is: only a change, and not while the PC helper is connected", () => {
    expect(hostOS("mac", newer, { host_os: "other" }, { connected: false })).toBe("mac");
    expect(hostOS("mac", newer, { host_os: "mac" }, { connected: false })).toBeNull();
    expect(hostOS("other", newer, {}, null)).toBe("other");
    expect(hostOS("mac", newer, { host_os: "other" }, { connected: true })).toBeNull();
    expect(hostOS("mac", older, { brightness: 100 }, null)).toBeNull(); // older software
    expect(hostOS("mac", undefined, {}, null)).toBeNull(); // no features at all
  });
});
