// Macs: a key combo can have a Mac version (mac_keys), which the device
// presses when its host_os setting is "mac". The editor shows and edits the
// combo for the computer the site runs on; the site tells the device which
// that is, unless the PC helper, which knows, is connected.

import type { Action, Config } from "./config";
import type { Features } from "./features";
import type { HostInfo, Settings } from "./proto";

export type OS = "mac" | "other";

interface Nav {
  platform?: string;
  userAgentData?: { platform?: string };
}

// browserOS is the computer the browser runs on.
export function browserOS(nav: Nav | undefined = globalThis.navigator as Nav | undefined): OS {
  const p = nav?.userAgentData?.platform || nav?.platform || "";
  return /^mac/i.test(p) ? "mac" : "other";
}

// macKeys says whether the device takes Mac key combos.
export const macKeys = (f?: Features | null) => !!f?.fields.includes("action.mac_keys");

// comboField is the field of a key combo action shown and edited on os: a
// Mac's own combo where it has one, else the one for every computer.
export function comboField(a: Action, os: OS, mac: boolean): "keys" | "mac_keys" {
  return os === "mac" && mac && a.mac_keys !== undefined ? "mac_keys" : "keys";
}

// withoutMacKeys is c without Mac key combos, for a device that doesn't
// take them: it presses keys everywhere.
export function withoutMacKeys(c: Config): Config {
  const strip = (a: Action): Action => {
    const { mac_keys: _, ...rest } = a;
    if (rest.steps) rest.steps = rest.steps.map(strip);
    if (rest.fallback) rest.fallback = strip(rest.fallback);
    return rest;
  };
  return {
    ...c,
    pages: Object.fromEntries(
      Object.entries(c.pages).map(([name, p]) => [
        name,
        { ...p, keys: Object.fromEntries(Object.entries(p.keys).map(([n, b]) => [n, { ...b, action: strip(b.action) }])) },
      ]),
    ),
  };
}

// hostOS is the host_os to tell the device, or null to leave it: only a
// device that takes it, only while the PC helper isn't connected, and only
// a change.
export function hostOS(os: OS, features?: Features | null, settings?: Settings | null, host?: HostInfo | null): OS | null {
  if (!features?.settings?.includes("host_os") || host?.connected || !settings) return null;
  return settings.host_os === os ? null : os;
}
