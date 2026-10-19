// The pages as a tree. The config keeps pages flat; the tree comes from
// which keys open which page, walking out from the home page, as someone
// pressing keys on the device would find them.
//
// - A page opened from several places shows once, where it's found first
//   (fewest presses from home).
// - A key that opens a page already in the tree (going back up, or a loop)
//   adds nothing.
// - Pages no key reaches are orphans, listed apart.

import type { Config } from "./config";

export interface PageNode {
  page: string;
  children: PageNode[];
}

export interface PageTree {
  root: PageNode | null; // the home page; null if it doesn't exist
  orphans: string[];
  parent: Map<string, string>; // page -> the page it's found under
}

// opens lists the pages a page's keys open, in key order.
export function opens(c: Config, page: string): string[] {
  const keys = c.pages[page]?.keys ?? {};
  return Object.keys(keys)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => keys[k].action)
    .filter((a) => a?.type === "page" && !!a.page && a.page in c.pages)
    .map((a) => a.page!);
}

export function pageTree(c: Config): PageTree {
  const parent = new Map<string, string>();
  if (!(c.home in c.pages)) return { root: null, orphans: Object.keys(c.pages).sort(), parent };
  const root: PageNode = { page: c.home, children: [] };
  const seen = new Set([c.home]);
  // breadth first, so each page lands at its shallowest place
  const queue = [root];
  for (let node = queue.shift(); node; node = queue.shift()) {
    for (const p of opens(c, node.page)) {
      if (seen.has(p)) continue;
      seen.add(p);
      parent.set(p, node.page);
      const child = { page: p, children: [] };
      node.children.push(child);
      queue.push(child);
    }
  }
  const orphans = Object.keys(c.pages)
    .filter((p) => !seen.has(p))
    .sort();
  return { root, orphans, parent };
}

// pathTo is the pages from home to page, as in a breadcrumb; just the page
// itself for an orphan.
export function pathTo(t: PageTree, page: string): string[] {
  const path = [page];
  for (let p = t.parent.get(page); p !== undefined; p = t.parent.get(p)) path.unshift(p);
  return path;
}
