// What the device's software supports (d200-deck's deck.Features, sent in
// hello), so the site offers only that and refuses to save what the device
// can't take. See d200-deck's docs/api.md, Features.

import { appNames, opName, typeName, usageNames } from "./actions";
import type { Action, Button, Config, Look } from "./config";
import type { HostInfo } from "./proto";

export interface Features {
  actions: string[];
  fields: string[]; // "<type>.<field>", e.g. "button.on"
  keys: string[];
  modifiers: string[];
  usages: string[];
  systems: string[];
  fonts: string[];
  apps: Record<string, string[]>; // ops by app
  args: Record<string, string[]>; // args by app
  limits: Record<string, number>;
  settings?: string[]; // the device settings it takes; older software doesn't say
}

const both = (a: string[], b: string[]) => a.filter((x) => b.includes(x));

// byApp keeps the site's lists for each app, cut to the other's where it
// knows the app: an app it doesn't know is another program's to check.
function byApp(site: Record<string, string[]>, other: Record<string, string[]>) {
  return Object.fromEntries(Object.entries(site).map(([app, l]) => [app, other[app] ? both(l, other[app]) : l]));
}

// Limits that change how the device works: one that doesn't report them
// works the older way.
const newWays = ["anim_bytes"];

// forDevice is what both the site and the device support, the smaller of
// each limit; the site's own with no device (for one that doesn't say, see
// older).
export function forDevice(site: Features, device?: Features | null): Features {
  if (!device) return site;
  return {
    actions: both(site.actions, device.actions ?? []),
    fields: both(site.fields, device.fields ?? []),
    keys: both(site.keys, device.keys ?? []),
    modifiers: both(site.modifiers, device.modifiers ?? []),
    usages: both(site.usages, device.usages ?? []),
    systems: both(site.systems, device.systems ?? []),
    fonts: both(site.fonts, device.fonts ?? []),
    apps: byApp(site.apps, device.apps ?? {}),
    args: byApp(site.args, device.args ?? {}),
    limits: Object.fromEntries(
      Object.entries(site.limits).flatMap(([k, v]) => {
        const d = device.limits?.[k];
        return d === undefined && newWays.includes(k) ? [] : [[k, Math.min(v, d ?? v)]];
      }),
    ),
  };
}

// older is what a device that doesn't say (older software) is taken to
// support: the site's lists, without the newer ways of working.
export function older(site: Features): Features {
  return { ...site, limits: Object.fromEntries(Object.entries(site.limits).filter(([k]) => !newWays.includes(k))) };
}

// runnable cuts app ops to those the PC helper runs, while it's connected.
export function runnable(f: Features, host?: HostInfo | null): Features {
  if (!host?.connected || !host.apps) return f;
  const ops = Object.fromEntries(host.apps.map((a) => [a.name, a.ops ?? f.apps[a.name] ?? []]));
  return { ...f, apps: Object.fromEntries(Object.entries(f.apps).map(([app, l]) => [app, both(l, ops[app] ?? [])])) };
}

// newer is whether the device supports things the site doesn't know: the
// page is older than the device's software.
export function newer(site: Features, device?: Features | null): boolean {
  if (!device) return false;
  const lacks = (a: string[] = [], b: string[]) => a.some((x) => !b.includes(x));
  return lacks(device.actions, site.actions) || lacks(device.fields, site.fields);
}

// Words for what can be unsupported, where the field name alone won't do.
const fieldWords: Record<string, string> = {
  "button.on": "looks while on",
  "look.font": "fonts",
  "button.font": "fonts",
  "config.fonts": "fonts",
  "button.image": "pictures",
  "look.image": "pictures",
  "config.images": "pictures",
  "icon.png": "emoji and picture icons",
  "action.fallback": "keys that do something else without the PC helper",
  "action.mac_keys": "Mac key combos",
};

// unsupported lists, in words, what c uses that f doesn't support.
export function unsupported(c: Config, f: Features): string[] {
  const out = new Set<string>();
  const L = f.limits;
  const field = (type: string, o: object) => {
    for (const k of Object.keys(o)) {
      const name = `${type}.${k}`;
      if (!f.fields.includes(name)) out.add(fieldWords[name] ?? `"${k}" in a ${type}`);
    }
  };
  const look = (l: Look, type: string) => {
    field(type, l);
    if (l.font && !c.fonts?.[l.font] && !f.fonts.includes(l.font)) out.add(`the font ${l.font}`);
    const label = l.label ?? "";
    if (L.label !== undefined && [...label].length > L.label) out.add(`labels over ${L.label} characters`);
    if (L.label_lines !== undefined && label.split("\n").length > L.label_lines) {
      out.add(`labels over ${L.label_lines} lines`);
    }
  };
  const action = (a: Action) => {
    field("action", a);
    if (a.type && !f.actions.includes(a.type)) out.add(`"${typeName(a.type)}" keys`);
    for (const k of [...(a.keys ?? []), ...(a.mac_keys ?? [])]) {
      const n = k.toLowerCase();
      if (!f.keys.includes(n) && !f.modifiers.includes(n)) out.add(`the key ${n}`);
    }
    if (typeof a.usage === "string" && !f.usages.includes(a.usage)) out.add(`the ${usageNames[a.usage] ?? a.usage} key`);
    if (a.system && !f.systems.includes(a.system)) out.add(`"${a.system}"`);
    if (a.type === "app" && a.app) {
      const app = appNames[a.app] ?? a.app;
      if (f.apps[a.app] && a.op && !f.apps[a.app].includes(a.op)) out.add(`${app}: ${opName(a.app, a.op)}`);
      for (const k of Object.keys(a.args ?? {})) {
        if (f.args[a.app] && !f.args[a.app].includes(k)) out.add(`${app} setting "${k}"`);
      }
    }
    if (a.text && L.text !== undefined && a.text.length > L.text) out.add(`text over ${L.text} characters`);
    if (a.steps && L.steps !== undefined && a.steps.length > L.steps) out.add(`macros over ${L.steps} steps`);
    a.steps?.forEach(action);
    if (a.fallback) action(a.fallback);
  };
  const button = (b: Button) => {
    look(b, "button");
    if (b.action) action(b.action);
    if (b.on) look(b.on, "look");
  };

  field("config", c);
  for (const p of Object.values(c.pages ?? {})) {
    field("page", p);
    Object.values(p.keys ?? {}).forEach(button);
  }
  for (const i of Object.values(c.icons ?? {})) field("icon", i);
  const size = (b64: string) => Math.floor((b64.length * 3) / 4);
  const over = (m: Record<string, string> | undefined, limit: number | undefined, words: string) => {
    if (limit !== undefined && Object.values(m ?? {}).some((v) => size(v) > limit)) out.add(words);
  };
  over(c.images, L.image_bytes, `pictures over ${kb(L.image_bytes)}`);
  over(c.fonts, L.font_bytes, `fonts over ${kb(L.font_bytes)}`);
  const pngs = Object.fromEntries(Object.entries(c.icons ?? {}).flatMap(([k, i]) => (i.png ? [[k, i.png]] : [])));
  over(pngs, L.icon_bytes, `picture icons over ${kb(L.icon_bytes)}`);
  if (L.icons !== undefined && Object.keys(c.icons ?? {}).length > L.icons) out.add(`more than ${L.icons} icons`);
  return [...out];
}

const kb = (n = 0) => `${Math.round(n / 1024)} KB`;

// unsupportedMessage is why the device can't take c, or "".
export function unsupportedMessage(c: Config, f: Features): string {
  const l = unsupported(c, f);
  if (!l.length) return "";
  // three at most, to stay short
  const what =
    l.length === 1 ? l[0] : l.length <= 3 ? `${l.slice(0, -1).join(", ")} and ${l.at(-1)}` : `${l.slice(0, 3).join(", ")} and ${l.length - 3} more`;
  return `This device's software doesn't support ${what}. Update it, or remove ${l.length === 1 ? "it" : "them"}.`;
}
