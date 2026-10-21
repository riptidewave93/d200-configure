// Newer device OS and deckhost releases on GitHub, for the update notices.
// The rules match deckhost's own notices (cmd/deckhost/osupdate.go in d200-deck).

import type { HostInfo } from "./proto";

export const osRepo = "riptidewave93/d200-buildroot";
export const hostRepo = "riptidewave93/d200-deck";

// what a release uploads last, once its other files are there
const readyFile = "SHA256SUMS";

export interface Release {
  tag: string;
  page: string;
  files: Record<string, string>; // uploaded file names to download links
}

// An Update is a newer release: its tag, and where to get it.
export interface Update {
  version: string;
  url: string;
}

const versionRE = /^v(\d+)\.(\d+)\.(\d+)(.*)$/;
// what git describe adds to a tag: commits past it, and local changes
const describeRE = /(-\d+-g[0-9a-f]+)?(-dirty)?(-local)?$/;

function parse(s: string): { core: number[]; pre: string } | null {
  const m = versionRE.exec(s);
  if (!m) return null;
  return { core: m.slice(1, 4).map(Number), pre: m[4].replace(describeRE, "") };
}

// isVersion reports whether s is a vX.Y.Z version that releases can be newer than.
export function isVersion(s: string): boolean {
  return parse(s) !== null;
}

// newer reports whether release tag is newer than version have. A version
// without a leading vX.Y.Z, such as a bare commit, never has a newer release.
export function newer(tag: string, have: string): boolean {
  const t = parse(tag);
  const h = parse(have);
  if (!t || !h) return false;
  for (let i = 0; i < 3; i++) {
    if (t.core[i] !== h.core[i]) return t.core[i] > h.core[i];
  }
  return h.pre !== "" && t.pre === ""; // a release is newer than its pre-releases
}

// osUpdate is rel if it's newer than the device's OS and has its update file
// for the device's flavour; url downloads that file.
export function osUpdate(rel: Release | null, have: string, flavour = ""): Update | null {
  if (!rel || !newer(rel.tag, have) || !rel.files[readyFile]) return null;
  const url = rel.files[`d200-${rel.tag}-${flavour || "release"}-update.tar`];
  return url ? { version: rel.tag, url } : null;
}

// hostUpdate is rel if it's newer than deckhost's version; url is the
// Windows installer on Windows, else the release page.
export function hostUpdate(rel: Release | null, have: string, os = ""): Update | null {
  if (!rel || !newer(rel.tag, have) || !rel.files[readyFile]) return null;
  const setup = os === "windows" ? rel.files[`deckhost-${rel.tag.slice(1)}-windows-amd64-setup.exe`] : undefined;
  return { version: rel.tag, url: setup ?? rel.page };
}

// hostUpdatesDevice reports whether the PC helper runs and has "Update
// device" in its menu; older ones don't.
export function hostUpdatesDevice(host: HostInfo | null): boolean {
  return !!host?.connected && host.state?.["update.device"] === true;
}

// how long an answer from GitHub is kept, so reloads don't ask again
export const cacheTime = 6 * 3600_000;

interface Cached {
  at: number;
  rel: Release | null;
}

// latest is repo's newest release, or null if it has none, or GitHub can't
// be reached or refuses (it limits how often it's asked).
export async function latest(repo: string): Promise<Release | null> {
  const key = `release:${repo}`;
  try {
    const c: Cached = JSON.parse(localStorage.getItem(key) ?? "null");
    if (c && Date.now() - c.at < cacheTime) return c.rel;
  } catch {
    // no storage, or a bad entry: ask GitHub
  }
  let rel: Release | null;
  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (resp.status === 404) {
      rel = null; // no release yet
    } else if (!resp.ok) {
      return null;
    } else {
      const r = await resp.json();
      rel = { tag: r.tag_name ?? "", page: r.html_url ?? "", files: {} };
      for (const a of r.assets ?? []) {
        if (a.state === "uploaded") rel.files[a.name] = a.browser_download_url;
      }
    }
  } catch {
    return null;
  }
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), rel } satisfies Cached));
  } catch {
    // it asks again next time
  }
  return rel;
}

// Update notices can be turned off in this browser, e.g. for a fork's firmware.
const noticesKey = "update-notices";

export function noticesOn(): boolean {
  try {
    return localStorage.getItem(noticesKey) !== "off";
  } catch {
    return true;
  }
}

export function setNotices(on: boolean) {
  try {
    if (on) localStorage.removeItem(noticesKey);
    else localStorage.setItem(noticesKey, "off");
  } catch {
    // private windows may refuse; it's on again next time
  }
}
