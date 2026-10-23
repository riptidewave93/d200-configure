import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Action, Config, Look } from "./config";
import { load } from "./deck";
import { embedAll } from "./icons.svelte";
import icons from "./icons.json";
import logos from "./logos.json";
import type { Logo } from "./logos";
import { fillPage, giveShortcut, matching, meetingApps, shortcuts } from "./meetings";

const all = logos.logos as Logo[];
const page = (keys: Config["pages"][string]["keys"] = {}): Config => ({ version: 1, home: "main", pages: { main: { keys } } });
const find = (app: string, label: string) => shortcuts.find((s) => s.app === app && s.label === label)!;

describe("meetings", () => {
  it("gives each shortcut an app, an icon and a logo that exist", () => {
    for (const s of shortcuts) {
      const m = meetingApps.find((a) => a.id === s.app);
      expect(m, s.title).toBeDefined();
      expect(all.some((l) => l.name === m!.logo), m!.logo).toBe(true);
      expect(s.icon in icons.icons, s.icon).toBe(true);
    }
  });

  it("makes keys the device takes", async () => {
    const d = await load(readFileSync(new URL("../wasm/deck.wasm", import.meta.url)));
    for (const m of meetingApps) {
      const c = page();
      expect(fillPage(c, "main", 14, m.id, all)).toBe(shortcuts.filter((s) => s.app === m.id).length);
      c.icons = (await embedAll(d, c)).icons;
      expect(d.validate(c), m.id).toBe("");
    }
  });

  it("knows a key's shortcut, by both combos", () => {
    expect(matching({ type: "hid-key", keys: ["alt", "a"], mac_keys: ["gui", "shift", "a"] })).toEqual([find("zoom", "Mic")]);
    expect(matching({ type: "hid-key", keys: ["alt", "a"] })).toEqual([]);
    expect(matching({ type: "type-text", text: " " })).toEqual([]);
    // the same key does both apps' push to talk
    expect(matching({ type: "hid-key", keys: ["space"] }).map((s) => s.app)).toEqual(["zoom", "meet"]);
  });
});

describe("giveShortcut", () => {
  it("sets both combos, and the look of a key without one", () => {
    const a: Action = { type: "hid-key", keys: [], mac_keys: ["gui", "x"] };
    const look: Look = {};
    giveShortcut(a, look, find("meet", "Captions"), all);
    expect(a).toEqual({ type: "hid-key", keys: ["c"] });
    expect(look).toEqual({ icon: "closed_caption", label: "Captions", color: "#00897B" });
    giveShortcut(a, look, find("zoom", "Mic"), all);
    expect(a).toEqual({ type: "hid-key", keys: ["alt", "a"], mac_keys: ["gui", "shift", "a"] });
    expect(look).toEqual({ icon: "mic", label: "Mic", color: "#0B5CFF" });
  });

  it("keeps a key's own look and label", () => {
    const a: Action = { type: "hid-key", keys: [] };
    const own: Look = { icon: "star", label: "Hi" };
    giveShortcut(a, own, find("zoom", "Mic"), all);
    expect(own).toEqual({ icon: "star", label: "Hi" });
    const label: Look = {};
    giveShortcut(a, label, find("zoom", "Mic"), all);
    label.label = "Mute";
    giveShortcut(a, label, find("zoom", "Camera"), all);
    expect(label).toMatchObject({ icon: "videocam", label: "Mute" });
  });
});

describe("fillPage", () => {
  it("fills empty keys, once", () => {
    const c = page({ 0: { icon: "back", action: { type: "back" } }, 2: { action: { type: "hid-key", keys: ["ctrl", "d"], mac_keys: ["gui", "d"] } } });
    const meet = shortcuts.filter((s) => s.app === "meet");
    expect(fillPage(c, "main", 14, "meet", all)).toBe(meet.length - 1); // its mic is on key 2 already
    expect(c.pages.main.keys[1].label).toBe("Camera");
    expect(c.pages.main.keys[2].label).toBeUndefined();
    expect(fillPage(c, "main", 14, "meet", all)).toBe(0);
  });

  it("stops at the last key", () => {
    const c = page();
    expect(fillPage(c, "main", 2, "zoom", all)).toBe(2);
    expect(Object.keys(c.pages.main.keys)).toEqual(["0", "1"]);
  });
});
