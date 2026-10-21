import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { kind, newAction } from "./actions";
import type { Config, Look } from "./config";
import icons from "./icons.json";
import logos from "./logos.json";
import { found, giveLook, program, programs } from "./programs";
import type { Logo } from "./logos";

const all = logos.logos as Logo[];
const config = (): Config => ({ version: 1, home: "main", pages: {} });

// the ids in d200-deck's docs/api.md, under "Open app"
function deckIDs(): string[] {
  const api = fs.readFileSync(`${process.env.DECK_DIR ?? "../d200-deck"}/docs/api.md`, "utf8");
  const section = api.split(/^### Open app$/m)[1]?.split(/^#/m)[0] ?? "";
  const rows = section.split("\n").filter((l) => l.startsWith("|"));
  return rows.flatMap((r) => [...r.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]));
}

describe("programs", () => {
  it("has the PC helper's ids, no more and no fewer", () => {
    const ids = deckIDs();
    expect(ids.length).toBeGreaterThan(0);
    expect(programs.map((p) => p.id).sort()).toEqual(ids.sort());
  });

  it("gives each a look that exists", () => {
    for (const p of programs) {
      if (p.logo) expect(all.some((l) => l.name === p.logo), p.id).toBe(true);
      else expect(p.icon! in icons.icons, p.id).toBe(true);
    }
  });

  it("is a type of its own in the editor", () => {
    const a = newAction("open-app");
    expect(a).toEqual({ type: "app", app: "programs", op: "open" });
    expect(kind(a)).toBe("open-app");
    expect(kind({ type: "app", app: "discord", op: "mute" })).toBe("app");
  });

  it("knows what the PC helper found", () => {
    expect(found(null)).toBeNull();
    expect(found({ connected: true, state: { "discord.ready": true } })).toBeNull(); // too old, or still looking
    const state = { "programs.ready": true, "programs.available:chrome": true, "programs.available:steam": false };
    expect(found({ connected: false, state })).toBeNull();
    expect(found({ connected: true, state })).toEqual(new Set(["chrome"]));
  });
});

describe("giveLook", () => {
  const chrome = program("chrome")!;
  const files = program("files")!;

  it("gives a key without an icon the app's logo, colours and title", () => {
    const c = config();
    const look: Look = {};
    giveLook(c, look, chrome, undefined, all);
    expect(look).toMatchObject({ icon: "googlechrome", label: "Chrome", color: "#4285F4" });
    expect(c.icons?.googlechrome?.d).toBeTruthy();
  });

  it("keeps a key's own icon, image and label", () => {
    const icon: Look = { icon: "star", color: "#ff0000" };
    giveLook(config(), icon, chrome, undefined, all);
    expect(icon).toEqual({ icon: "star", color: "#ff0000" });
    const image: Look = { image: "a" };
    giveLook(config(), image, chrome, undefined, all);
    expect(image).toEqual({ image: "a" });
    const label: Look = { label: "Web" };
    giveLook(config(), label, chrome, undefined, all);
    expect(label).toMatchObject({ icon: "googlechrome", label: "Web" });
  });

  it("replaces the look the last app gave", () => {
    const look: Look = {};
    giveLook(config(), look, chrome, undefined, all);
    giveLook(config(), look, files, chrome, all);
    expect(look).toEqual({ icon: "folder", label: "Files" });
  });

  it("keeps a label changed since", () => {
    const look: Look = {};
    giveLook(config(), look, chrome, undefined, all);
    look.label = "Web";
    giveLook(config(), look, files, chrome, all);
    expect(look).toEqual({ icon: "folder", label: "Web" });
  });
});
