import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Action, Button, Config, Look } from "./config";
import { load } from "./deck";
import type { Features } from "./features";
import { embedAll } from "./icons.svelte";
import icons from "./icons.json";
import logos from "./logos.json";
import type { Logo } from "./logos";
import { fillPage, forPage, giveShortcut, matching, meetingApps, offered, shortcuts } from "./meetings";

const all = logos.logos as Logo[];
const page = (keys: Config["pages"][string]["keys"] = {}): Config => ({ version: 1, home: "main", pages: { main: { keys } } });
const find = (app: string, label: string) => shortcuts.find((s) => s.app === app && s.label === label)!;
const withMic = { apps: { mic: ["mute", "push-to-talk"] } } as unknown as Features;
const withoutMic = { apps: {} } as unknown as Features;

describe("meetings", () => {
  it("gives each shortcut an app, an icon and a logo that exist", () => {
    for (const s of shortcuts) {
      const m = meetingApps.find((a) => a.id === s.app);
      expect(m, s.title).toBeDefined();
      if (m!.logo) expect(all.some((l) => l.name === m!.logo), m!.logo).toBe(true);
      for (const icon of [s.icon, s.on?.icon]) if (icon) expect(icon in icons.icons, icon).toBe(true);
    }
  });

  it("makes keys the device takes", async () => {
    const d = await load(readFileSync(new URL("../wasm/deck.wasm", import.meta.url)));
    const c = page();
    expect(fillPage(c, "main", 14, shortcuts.filter((s) => s.app !== "meet"), all)).toBe(8);
    c.pages.meet = { keys: {} };
    fillPage(c, "meet", 14, forPage("meet", withMic), all);
    c.icons = (await embedAll(d, c)).icons;
    expect(d.validate(c)).toBe("");
  });

  it("knows a key's shortcut, by both combos or the app op", () => {
    expect(matching({ type: "hid-key", keys: ["alt", "a"], mac_keys: ["gui", "shift", "a"] })).toEqual([find("zoom", "Mic")]);
    expect(matching({ type: "hid-key", keys: ["alt", "a"] })).toEqual([]);
    expect(matching({ type: "app", app: "mic", op: "mute" })).toEqual([find("mic", "PC Mic")]);
    expect(matching({ type: "app", app: "discord", op: "mute" })).toEqual([]);
    expect(matching({})).toEqual([]);
    // the same key does both apps' push to talk
    expect(matching({ type: "hid-key", keys: ["space"] }).map((s) => s.app)).toEqual(["zoom", "meet"]);
  });

  it("offers mic keys only where they run", () => {
    expect(offered(find("mic", "PC Mic"), withMic)).toBe(true);
    expect(offered(find("mic", "PC Mic"), withoutMic)).toBe(false);
    expect(offered(find("mic", "PC Mic"), null)).toBe(false);
    expect(offered(find("zoom", "Mic"), null)).toBe(true);
    expect(forPage("zoom", withoutMic).map((s) => s.app)).not.toContain("mic");
    expect(forPage("zoom", withMic).at(-1)).toBe(find("mic", "PC Mic"));
  });
});

describe("giveShortcut", () => {
  it("sets the action, and the look of a key without one", () => {
    const a: Action = { type: "hid-key", keys: [], mac_keys: ["gui", "x"] };
    const look: Look = {};
    giveShortcut(a, look, find("meet", "Captions"), all);
    expect(a).toEqual({ type: "hid-key", keys: ["c"] });
    expect(look).toEqual({ icon: "closed_caption", label: "Captions", color: "#00897B" });
    giveShortcut(a, look, find("zoom", "Mic"), all);
    expect(a).toEqual({ type: "hid-key", keys: ["alt", "a"], mac_keys: ["gui", "shift", "a"] });
    expect(look).toEqual({ icon: "mic", label: "Mic", color: "#0B5CFF" });
  });

  it("gives a mic key its looks, and takes them back", () => {
    const b: Button = { action: { type: "hid-key", keys: ["alt", "a"], mac_keys: ["gui", "shift", "a"] }, icon: "mic", label: "Mic", color: "#0B5CFF" };
    giveShortcut(b.action, b, find("mic", "PC Mic"), all);
    expect(b).toEqual({
      action: { type: "app", app: "mic", op: "mute" },
      icon: "mic",
      label: "PC Mic",
      on: { icon: "mic_off", background: "#c62828" },
    });
    giveShortcut(b.action, b, find("meet", "Chat"), all);
    expect(b).toEqual({ action: { type: "hid-key", keys: ["ctrl", "alt", "c"], mac_keys: ["ctrl", "gui", "c"] }, icon: "chat", label: "Chat", color: "#00897B" });
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
    const meet = forPage("meet", withMic);
    expect(fillPage(c, "main", 14, meet, all)).toBe(meet.length - 1); // its mic is on key 2 already
    expect(c.pages.main.keys[1].label).toBe("Camera");
    expect(c.pages.main.keys[2].label).toBeUndefined();
    expect(c.pages.main.keys[8].action).toEqual({ type: "app", app: "mic", op: "mute" });
    expect(fillPage(c, "main", 14, meet, all)).toBe(0);
  });

  it("stops at the last key", () => {
    const c = page();
    expect(fillPage(c, "main", 2, forPage("zoom", null), all)).toBe(2);
    expect(Object.keys(c.pages.main.keys)).toEqual(["0", "1"]);
  });
});
