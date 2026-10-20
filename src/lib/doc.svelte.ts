// The config being edited, and what's selected in it.

import type { Action, Button, Config } from "./config";
import type { Deck } from "./deck";
import { pageTree, pathTo, type PageTree } from "./pages";
import { usedImages } from "./pictures";

// A key on a page.
export interface KeyRef {
  page: string;
  key: number;
}

export class Doc {
  config = $state<Config | null>(null);
  // the config as last loaded or saved, to tell whether it changed
  saved = $state("");
  page = $state("");
  key = $state<number | null>(null);
  // set when a new page wants its name typed
  naming = $state(false);

  dirty = $derived(this.config !== null && JSON.stringify(this.config) !== this.saved);

  tree = $derived<PageTree>(
    this.config ? pageTree(this.config) : { root: null, orphans: [], parent: new Map() },
  );
  // the pages from home to the one shown
  path = $derived(pathTo(this.tree, this.page));

  // loads counts configs loaded, so drawing can tell a new config's images
  // and fonts from the last one's
  loads = $state(0);

  load(c: Config) {
    this.loads++;
    this.config = c;
    this.saved = JSON.stringify(c);
    this.page = c.home in c.pages ? c.home : (Object.keys(c.pages)[0] ?? "");
    this.key = null;
  }

  markSaved() {
    this.saved = JSON.stringify(this.config);
  }

  revert() {
    if (this.saved) this.load(JSON.parse(this.saved));
  }

  // tidy gives the config exactly the icons its keys can show, from its own
  // and the catalog, and drops the images no key shows: the device has
  // little room. It returns the icon names found in neither.
  tidy(deck: Deck): string[] {
    const { icons, unknown } = deck.embed(this.c);
    if (Object.keys(icons).length) this.c.icons = icons;
    else delete this.c.icons;
    if (this.c.images) {
      const used = usedImages(this.c);
      for (const id of Object.keys(this.c.images)) if (!used.has(id)) delete this.c.images[id];
      if (!Object.keys(this.c.images).length) delete this.c.images;
    }
    return unknown;
  }

  private get c(): Config {
    if (!this.config) throw new Error("no config");
    return this.config;
  }

  // pages, home first
  get pages(): string[] {
    const c = this.config;
    if (!c) return [];
    return Object.keys(c.pages).sort((a, b) => Number(b === c.home) - Number(a === c.home) || a.localeCompare(b));
  }

  button(key: number): Button | undefined {
    return this.config?.pages[this.page]?.keys[key];
  }

  setButton(key: number, b: Button | undefined) {
    const keys = this.c.pages[this.page].keys;
    if (b) keys[key] = b;
    else delete keys[key];
  }

  // moveKey moves a key's button to another key, on this page or another;
  // a button already there swaps places with it, so nothing is lost. With
  // copy, the target gets a copy instead, replacing what was there.
  moveKey(from: KeyRef, to: KeyRef, copy = false) {
    const src = this.c.pages[from.page]?.keys;
    const dst = this.c.pages[to.page]?.keys;
    const b = src?.[from.key];
    if (!src || !dst || !b || (from.page === to.page && from.key === to.key)) return;
    if (copy) {
      dst[to.key] = structuredClone($state.snapshot(b)) as Button;
      return;
    }
    const there = dst[to.key];
    dst[to.key] = b;
    if (there) src[from.key] = there;
    else delete src[from.key];
  }

  // the key copied or cut, to paste on another
  clip = $state<{ from: KeyRef; cut: boolean } | null>(null);

  copyKey(cut = false) {
    if (this.key !== null && this.button(this.key)) this.clip = { from: { page: this.page, key: this.key }, cut };
  }

  // pasteKey puts the copied or cut key on the selected one: a cut one moves
  // (swapping), a copied one is copied.
  pasteKey() {
    const c = this.clip;
    if (!c || this.key === null || !this.config?.pages[c.from.page]?.keys[c.from.key]) return;
    this.moveKey(c.from, { page: this.page, key: this.key }, !c.cut);
    if (c.cut) this.clip = null;
  }

  // pageNameError says what's wrong with a new page name, or "".
  pageNameError(name: string): string {
    if (!name.trim()) return "Give the page a name.";
    if (name in this.c.pages) return "There's a page with that name.";
    return "";
  }

  openPage(name: string) {
    this.page = name;
    this.key = null;
  }

  // newPageName is a free name for a new page: "page 1", "page 2", ...
  newPageName(): string {
    for (let n = 1; ; n++) if (!(`page ${n}` in this.c.pages)) return `page ${n}`;
  }

  addPage(name: string) {
    this.c.pages[name] = { keys: {} };
    this.openPage(name);
    this.naming = true;
  }

  // addFolder adds a page with a Back key on its first key, so it can be
  // left on the device, without going to it.
  addFolder(name: string) {
    this.c.pages[name] = { keys: { 0: { icon: "back", label: "Back", action: { type: "back" } } } };
  }

  // renamePage renames a page and the keys that open it.
  renamePage(from: string, to: string) {
    const c = this.c;
    if (from === to) return;
    c.pages[to] = c.pages[from];
    delete c.pages[from];
    if (c.home === from) c.home = to;
    for (const a of this.pageActions(from)) a.page = to;
    if (this.page === from) this.page = to;
  }

  // keysOpening lists the keys that open page, as "page: key".
  keysOpening(page: string): { page: string; key: number }[] {
    const out = [];
    for (const [name, p] of Object.entries(this.c.pages)) {
      for (const [k, b] of Object.entries(p.keys)) {
        if (b.action.type === "page" && b.action.page === page) out.push({ page: name, key: Number(k) });
      }
    }
    return out;
  }

  // deletePage deletes a page and clears the keys that open it. Not the home page.
  deletePage(name: string) {
    const c = this.c;
    if (name === c.home) return;
    for (const { page, key } of this.keysOpening(name)) delete c.pages[page].keys[key];
    delete c.pages[name];
    if (this.page === name) {
      this.page = c.home;
      this.key = null;
    }
  }

  private pageActions(page: string): Action[] {
    const out = [];
    for (const p of Object.values(this.c.pages)) {
      for (const b of Object.values(p.keys)) if (b.action.type === "page" && b.action.page === page) out.push(b.action);
    }
    return out;
  }
}
