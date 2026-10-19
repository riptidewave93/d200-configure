import { describe, expect, it } from "vitest";
import type { Config } from "./config";
import { Doc } from "./doc.svelte";

function config(): Config {
  return {
    version: 1,
    home: "main",
    pages: {
      main: { keys: { "0": { label: "Media", action: { type: "page", page: "media" } } } },
      media: { keys: { "0": { action: { type: "back" } } } },
    },
  };
}

describe("Doc", () => {
  it("tells when the config changed, and reverts", () => {
    const d = new Doc();
    d.load(config());
    expect(d.dirty).toBe(false);
    d.setButton(5, { label: "Hi", action: { type: "type-text", text: "hi" } });
    expect(d.dirty).toBe(true);
    d.revert();
    expect(d.dirty).toBe(false);
    expect(d.button(5)).toBeUndefined();
  });

  it("lists the home page first", () => {
    const d = new Doc();
    d.load({ ...config(), home: "media" });
    expect(d.pages).toEqual(["media", "main"]);
  });

  it("renames a page and the keys that open it", () => {
    const d = new Doc();
    d.load(config());
    d.renamePage("media", "music");
    expect(Object.keys(d.config!.pages).sort()).toEqual(["main", "music"]);
    expect(d.config!.pages.main.keys["0"].action.page).toBe("music");
  });

  it("deletes a page and the keys that open it", () => {
    const d = new Doc();
    d.load(config());
    expect(d.keysOpening("media")).toEqual([{ page: "main", key: 0 }]);
    d.deletePage("media");
    expect(d.config!.pages).toEqual({ main: { keys: {} } });
  });

  it("keeps the home page", () => {
    const d = new Doc();
    d.load(config());
    d.deletePage("main");
    expect(d.config!.pages.main).toBeDefined();
  });

  it("checks new page names", () => {
    const d = new Doc();
    d.load(config());
    expect(d.pageNameError("")).not.toBe("");
    expect(d.pageNameError("main")).not.toBe("");
    expect(d.pageNameError("games")).toBe("");
  });
});
