import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Config } from "./config";
import { load } from "./deck";
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
  it("tidies before saving: catalog icons in, unused icons and images out", async () => {
    const deck = await load(readFileSync(new URL("../wasm/deck.wasm", import.meta.url)));
    const d = new Doc();
    const c = config();
    c.pages.main.keys["1"] = { icon: "mic", action: {} };
    c.pages.main.keys["2"] = { image: "logo", action: {} };
    c.icons = { old: { d: "M0 0Z", viewBox: "0 0 1 1" } };
    c.images = { logo: "x", unused: "y" };
    d.load(c);
    expect(d.tidy(deck)).toEqual([]);
    expect(Object.keys(d.config!.icons!)).toEqual(["mic"]);
    expect(Object.keys(d.config!.images!)).toEqual(["logo"]);
    delete d.config!.pages.main.keys["1"];
    delete d.config!.pages.main.keys["2"];
    d.tidy(deck);
    expect(d.config!.images).toBeUndefined();
    expect(d.config!.icons).toBeUndefined();
  });

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

  it("adds a folder with a Back key", () => {
    const d = new Doc();
    d.load(config());
    expect(d.newPageName()).toBe("page 1");
    d.addFolder("games");
    expect(d.config!.pages.games.keys[0].action).toEqual({ type: "back" });
    expect(d.page).toBe("main");
  });

  it("follows the tree for the path", () => {
    const d = new Doc();
    d.load(config());
    d.openPage("media");
    expect(d.path).toEqual(["main", "media"]);
  });

  it("checks new page names", () => {
    const d = new Doc();
    d.load(config());
    expect(d.pageNameError("")).not.toBe("");
    expect(d.pageNameError("main")).not.toBe("");
    expect(d.pageNameError("games")).toBe("");
  });
});
