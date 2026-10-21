import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheTime,
  hostUpdate,
  hostUpdatesDevice,
  latest,
  newer,
  noticesOn,
  osUpdate,
  setNotices,
  type Release,
} from "./releases";

describe("newer", () => {
  it.each([
    ["v0.2.0", "v0.1.9", true],
    ["v1.0.0", "v0.9.9", true],
    ["v0.1.10", "v0.1.9", true],
    ["v0.1.0", "v0.1.0", false],
    ["v0.1.0", "v0.2.0", false],
    // git describe's additions don't count
    ["v0.1.0", "v0.1.0-3-gabc1234", false],
    ["v0.1.0", "v0.1.0-3-gabc1234-dirty", false],
    ["v0.1.1", "v0.1.0-3-gabc1234-dirty-local", true],
    // a release is newer than its pre-releases, not the other way round
    ["v0.2.0", "v0.2.0-rc1", true],
    ["v0.2.0-rc1", "v0.2.0", false],
    ["v0.2.0-rc2", "v0.2.0-rc1", false],
    // a bare commit or no version never has a newer release
    ["v0.2.0", "0123456789abcdef", false],
    ["v0.2.0", "", false],
    ["main", "v0.1.0", false],
  ])("%s over %s: %s", (tag, have, want) => {
    expect(newer(tag, have)).toBe(want);
  });
});

const os: Release = {
  tag: "v0.2.0",
  page: "https://github.com/o/r/releases/tag/v0.2.0",
  files: {
    "d200-v0.2.0-release-update.tar": "https://dl/release.tar",
    "d200-v0.2.0-debug-update.tar": "https://dl/debug.tar",
    SHA256SUMS: "https://dl/sums",
  },
};

describe("osUpdate", () => {
  it("links the update file for the device's flavour", () => {
    expect(osUpdate(os, "v0.1.0")).toEqual({ version: "v0.2.0", url: "https://dl/release.tar" });
    expect(osUpdate(os, "v0.1.0", "release")?.url).toBe("https://dl/release.tar");
    expect(osUpdate(os, "v0.1.0", "debug")?.url).toBe("https://dl/debug.tar");
  });

  it("waits until the files are uploaded", () => {
    const { SHA256SUMS: _, ...noSums } = os.files;
    expect(osUpdate({ ...os, files: noSums }, "v0.1.0")).toBeNull();
    expect(osUpdate(os, "v0.1.0", "other")).toBeNull();
  });

  it("is nothing without a newer release", () => {
    expect(osUpdate(null, "v0.1.0")).toBeNull();
    expect(osUpdate(os, "v0.2.0")).toBeNull();
  });
});

describe("hostUpdate", () => {
  const host: Release = {
    tag: "v0.2.0",
    page: "https://github.com/o/r/releases/tag/v0.2.0",
    files: { "deckhost-0.2.0-windows-amd64-setup.exe": "https://dl/setup.exe", SHA256SUMS: "https://dl/sums" },
  };

  it("links the installer on Windows, else the release page", () => {
    expect(hostUpdate(host, "v0.1.1", "windows")).toEqual({ version: "v0.2.0", url: "https://dl/setup.exe" });
    expect(hostUpdate(host, "v0.1.1", "linux")?.url).toBe(host.page);
    expect(hostUpdate(host, "v0.1.1")?.url).toBe(host.page);
  });

  it("waits for SHA256SUMS, and needs a newer release", () => {
    expect(hostUpdate({ ...host, files: {} }, "v0.1.1")).toBeNull();
    expect(hostUpdate(host, "v0.2.0")).toBeNull();
  });
});

describe("hostUpdatesDevice", () => {
  it("is only a running PC helper that says it can", () => {
    expect(hostUpdatesDevice({ connected: true, state: { "update.device": true } })).toBe(true);
    expect(hostUpdatesDevice({ connected: true, state: { "update.device": false } })).toBe(false);
    expect(hostUpdatesDevice({ connected: true, version: "v0.2.0" })).toBe(false);
    expect(hostUpdatesDevice({ connected: false, state: { "update.device": true } })).toBe(false);
    expect(hostUpdatesDevice(null)).toBe(false);
  });
});

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const answer = {
  tag_name: "v0.2.0",
  html_url: "https://github.com/o/r/releases/tag/v0.2.0",
  assets: [
    { name: "SHA256SUMS", state: "uploaded", browser_download_url: "https://dl/sums" },
    { name: "half.tar", state: "starter", browser_download_url: "https://dl/half.tar" },
  ],
};

describe("latest", () => {
  let fetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetch = vi.fn(async () => new Response(JSON.stringify(answer)));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("localStorage", memoryStorage());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps uploaded files, and the answer for a while", async () => {
    vi.useFakeTimers();
    const want = { tag: "v0.2.0", page: answer.html_url, files: { SHA256SUMS: "https://dl/sums" } };
    expect(await latest("o/r")).toEqual(want);
    expect(fetch).toHaveBeenCalledWith("https://api.github.com/repos/o/r/releases/latest", expect.anything());
    vi.advanceTimersByTime(cacheTime - 1000);
    expect(await latest("o/r")).toEqual(want);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    await latest("o/r");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps 'no release yet' too", async () => {
    fetch.mockResolvedValue(new Response("", { status: 404 }));
    expect(await latest("o/r")).toBeNull();
    expect(await latest("o/r")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("asks again after GitHub refuses or can't be reached", async () => {
    fetch.mockResolvedValueOnce(new Response("", { status: 403 }));
    fetch.mockRejectedValueOnce(new TypeError("offline"));
    expect(await latest("o/r")).toBeNull();
    expect(await latest("o/r")).toBeNull();
    expect((await latest("o/r"))?.tag).toBe("v0.2.0");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("works without storage", async () => {
    const refuse = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: refuse, setItem: refuse, removeItem: refuse });
    expect((await latest("o/r"))?.tag).toBe("v0.2.0");
    expect(noticesOn()).toBe(true);
    setNotices(false);
  });

  it("remembers notices turned off", () => {
    expect(noticesOn()).toBe(true);
    setNotices(false);
    expect(noticesOn()).toBe(false);
    setNotices(true);
    expect(noticesOn()).toBe(true);
  });
});
