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
    expect(await d.tidy(deck)).toEqual([]);
    expect(Object.keys(d.config!.icons!)).toEqual(["mic"]);
    expect(Object.keys(d.config!.images!)).toEqual(["logo"]);
    delete d.config!.pages.main.keys["1"];
    delete d.config!.pages.main.keys["2"];
    await d.tidy(deck);
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

  it("opens a config that isn't on the device as unsaved: a file, or a new one", () => {
    const d = new Doc();
    d.open(config(), false); // no device
    expect(d.dirty).toBe(true);
    expect(d.saved).toBe(""); // nothing to discard back to
    expect(d.page).toBe("main");

    const onDevice = new Doc();
    onDevice.load(config());
    const before = onDevice.saved;
    onDevice.open({ ...config(), home: "main" }, true);
    expect(onDevice.saved).toBe(before); // Discard goes back to the device's
  });

  it("closes, back to no config", () => {
    const d = new Doc();
    d.load(config());
    d.key = 3;
    d.close();
    expect([d.config, d.saved, d.key, d.dirty]).toEqual([null, "", null, false]);
  });

  it("moves keys, swapping, and copies them", () => {
    const d = new Doc();
    d.load(config());
    const media = d.config!.pages.media.keys;
    const main = d.config!.pages.main.keys;
    main["3"] = { label: "Three", action: {} };
    d.moveKey({ page: "main", key: 0 }, { page: "main", key: 3 }); // swap on a page
    expect([main["0"].label, main["3"].label]).toEqual(["Three", "Media"]);
    d.moveKey({ page: "main", key: 0 }, { page: "media", key: 5 }); // to an empty key elsewhere
    expect(main["0"]).toBeUndefined();
    expect(media["5"].label).toBe("Three");
    d.moveKey({ page: "media", key: 5 }, { page: "main", key: 1 }, true); // a copy
    expect(main["1"].label).toBe("Three");
    main["1"].label = "Changed";
    expect(media["5"].label).toBe("Three"); // not the same object
  });

  it("copies, cuts and pastes keys across pages", () => {
    const d = new Doc();
    d.load(config());
    d.key = 0;
    d.copyKey();
    d.openPage("media");
    d.key = 2;
    d.pasteKey();
    expect(d.config!.pages.media.keys["2"].label).toBe("Media");
    expect(d.config!.pages.main.keys["0"].label).toBe("Media"); // still there
    d.key = 2;
    d.copyKey(true);
    d.openPage("main");
    d.key = 4;
    d.pasteKey();
    expect(d.config!.pages.main.keys["4"].label).toBe("Media");
    expect(d.config!.pages.media.keys["2"]).toBeUndefined(); // moved
    expect(d.clip).toBeNull();
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
