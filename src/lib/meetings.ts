import type { Action, Button, Config, Look } from "./config";
import { set } from "./edit";
import { brandColours, type Logo } from "./logos";

// Ready-made key combos for video calls: each a key combo with its Mac
// version, so one key works on Windows, Linux and Mac. Another app needs
// only an entry in meetingApps and its shortcuts.

export interface MeetingApp {
  id: string;
  title: string;
  logo: string; // its logo in logos.json, for the key's colours
  note: string; // where its shortcuts work
}

export interface Shortcut {
  app: string;
  title: string; // in the picker
  label: string; // on the key
  icon: string; // a device icon
  keys: string[];
  mac_keys?: string[]; // none: keys on a Mac too
  note?: string;
}

export const meetingApps: MeetingApp[] = [
  { id: "zoom", title: "Zoom", logo: "zoom", note: "Works in Zoom while it's in front, or anywhere if set to global there." },
  { id: "meet", title: "Google Meet", logo: "googlemeet", note: "Works in the Meet tab while it's in front." },
];

const muted = "The key can't show if you're muted.";

// From the makers' shortcut pages:
// https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067050
// https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063245 (push to talk)
// https://support.google.com/a/users/answer/9896256 (Linux browsers use its Windows keys)
export const shortcuts: Shortcut[] = [
  { app: "zoom", title: "Mute or unmute", label: "Mic", icon: "mic", keys: ["alt", "a"], mac_keys: ["gui", "shift", "a"], note: muted },
  { app: "zoom", title: "Camera on or off", label: "Camera", icon: "videocam", keys: ["alt", "v"], mac_keys: ["gui", "shift", "v"] },
  {
    app: "zoom",
    title: "Share screen",
    label: "Share",
    icon: "present_to_all",
    keys: ["alt", "s"],
    mac_keys: ["gui", "shift", "s"],
    note: "On Windows, only while Zoom's meeting controls have focus.",
  },
  { app: "zoom", title: "Raise or lower hand", label: "Raise Hand", icon: "back_hand", keys: ["alt", "y"] },
  {
    app: "zoom",
    title: "Chat",
    label: "Chat",
    icon: "chat",
    keys: ["alt", "h"],
    mac_keys: ["gui", "shift", "h"],
    note: "Zoom doesn't list it for Linux.",
  },
  {
    app: "zoom",
    title: "Push to talk (hold)",
    label: "Push to Talk",
    icon: "record_voice_over",
    keys: ["space"],
    note: "Turn on “Press and hold Space” in Zoom's Audio settings.",
  },

  { app: "meet", title: "Mute or unmute", label: "Mic", icon: "mic", keys: ["ctrl", "d"], mac_keys: ["gui", "d"], note: muted },
  { app: "meet", title: "Camera on or off", label: "Camera", icon: "videocam", keys: ["ctrl", "e"], mac_keys: ["gui", "e"] },
  { app: "meet", title: "Present", label: "Present", icon: "present_to_all", keys: ["ctrl", "alt", "t"], mac_keys: ["ctrl", "gui", "t"] },
  { app: "meet", title: "Raise or lower hand", label: "Raise Hand", icon: "back_hand", keys: ["ctrl", "alt", "h"], mac_keys: ["ctrl", "gui", "h"] },
  { app: "meet", title: "Chat", label: "Chat", icon: "chat", keys: ["ctrl", "alt", "c"], mac_keys: ["ctrl", "gui", "c"] },
  { app: "meet", title: "Captions", label: "Captions", icon: "closed_caption", keys: ["c"] },
  {
    app: "meet",
    title: "Push to talk (hold)",
    label: "Push to Talk",
    icon: "record_voice_over",
    keys: ["space"],
    note: "Turn on Push to talk in Meet's settings.",
  },
];

export const meetingApp = (id: string) => meetingApps.find((m) => m.id === id);

const same = (a?: string[], b?: string[]) => (a ?? []).join("+") === (b ?? []).join("+");

// matching is the shortcuts action a presses, e.g. both apps' push to talk.
export const matching = (a: Action) =>
  a.type === "hid-key" ? shortcuts.filter((s) => same(s.keys, a.keys) && same(s.mac_keys, a.mac_keys)) : [];

// giveShortcut makes a press s. Its look gets s's icon, label and app
// colour when it has no icon or image of its own, or still has the one the
// last shortcut gave it; a custom look stays.
export function giveShortcut(a: Action, look: Look, s: Shortcut, logos: Logo[]) {
  const was = matching(a)[0];
  a.keys = [...s.keys];
  set(a, "mac_keys", s.mac_keys && [...s.mac_keys]);
  const ours = was && look.icon === was.icon && !look.image;
  if (!ours && (look.icon || look.image)) return;
  if (!look.label || (ours && look.label === was.label)) look.label = s.label;
  look.icon = s.icon;
  if (ours) {
    delete look.color;
    delete look.background;
  }
  const hex = logos.find((l) => l.name === meetingApp(s.app)?.logo)?.hex;
  if (!hex) return;
  const k = brandColours(hex, look.background);
  set(look, "color", k.color);
  if (k.background) set(look, "background", k.background);
}

// fillPage puts app's shortcuts that page lacks on its empty keys, the
// first keys of a device with that many, and says how many it put.
export function fillPage(c: Config, page: string, keys: number, app: string, logos: Logo[]): number {
  const p = c.pages[page];
  const have = Object.values(p.keys).flatMap((b) => matching(b.action));
  const todo = shortcuts.filter((s) => s.app === app && !have.includes(s));
  let n = 0;
  for (let k = 0; k < keys && n < todo.length; k++) {
    if (p.keys[k]) continue;
    const b: Button = { action: { type: "hid-key" } };
    giveShortcut(b.action, b, todo[n++], logos);
    p.keys[k] = b;
  }
  return n;
}
