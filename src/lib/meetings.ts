import type { Action, Button, Config, Look } from "./config";
import { set } from "./edit";
import type { Features } from "./features";
import { brandColours, type Logo } from "./logos";

// Ready-made keys for video calls. Most are a key combo with its Mac
// version, so one key works on Windows, Linux and Mac. Another app needs
// only an entry in meetingApps and its shortcuts.

export interface MeetingApp {
  id: string;
  title: string;
  logo?: string; // its logo in logos.json, for the key's colours
  note: string; // where its shortcuts work
}

export interface Shortcut {
  app: string;
  title: string; // in the picker
  label: string; // on the key
  icon: string; // a device icon
  action: Action;
  on?: Look; // the key's look while the action's state is on
  note?: string;
}

export const meetingApps: MeetingApp[] = [
  { id: "zoom", title: "Zoom", logo: "zoom", note: "Works in Zoom while it's in front, or anywhere if set to global there." },
  { id: "meet", title: "Google Meet", logo: "googlemeet", note: "Works in the Meet tab while it's in front." },
  { id: "mic", title: "All apps", note: "Mutes the PC's mic for every app; the call app still shows you as unmuted." },
];

// combo is a key combo, e.g. "alt+a", and a Mac's own if it differs.
function combo(keys: string, mac?: string): Action {
  const a: Action = { type: "hid-key", keys: keys.split("+") };
  if (mac) a.mac_keys = mac.split("+");
  return a;
}

const muted = "The key can't show if you're muted.";

// From the makers' shortcut pages:
// https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067050
// https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063245 (push to talk)
// https://support.google.com/a/users/answer/9896256 (Linux browsers use its Windows keys)
// The mic app is the PC helper's (d200-deck docs/mic.md).
export const shortcuts: Shortcut[] = [
  { app: "zoom", title: "Mute or unmute", label: "Mic", icon: "mic", action: combo("alt+a", "gui+shift+a"), note: muted },
  { app: "zoom", title: "Camera on or off", label: "Camera", icon: "videocam", action: combo("alt+v", "gui+shift+v") },
  {
    app: "zoom",
    title: "Share screen",
    label: "Share",
    icon: "present_to_all",
    action: combo("alt+s", "gui+shift+s"),
    note: "On Windows, only while Zoom's meeting controls have focus.",
  },
  { app: "zoom", title: "Raise or lower hand", label: "Raise Hand", icon: "back_hand", action: combo("alt+y") },
  { app: "zoom", title: "Chat", label: "Chat", icon: "chat", action: combo("alt+h", "gui+shift+h"), note: "Zoom doesn't list it for Linux." },
  {
    app: "zoom",
    title: "Push to talk (hold)",
    label: "Push to Talk",
    icon: "record_voice_over",
    action: combo("space"),
    note: "Turn on “Press and hold Space” in Zoom's Audio settings.",
  },

  { app: "meet", title: "Mute or unmute", label: "Mic", icon: "mic", action: combo("ctrl+d", "gui+d"), note: muted },
  { app: "meet", title: "Camera on or off", label: "Camera", icon: "videocam", action: combo("ctrl+e", "gui+e") },
  { app: "meet", title: "Present", label: "Present", icon: "present_to_all", action: combo("ctrl+alt+t", "ctrl+gui+t") },
  { app: "meet", title: "Raise or lower hand", label: "Raise Hand", icon: "back_hand", action: combo("ctrl+alt+h", "ctrl+gui+h") },
  { app: "meet", title: "Chat", label: "Chat", icon: "chat", action: combo("ctrl+alt+c", "ctrl+gui+c") },
  { app: "meet", title: "Captions", label: "Captions", icon: "closed_caption", action: combo("c") },
  {
    app: "meet",
    title: "Push to talk (hold)",
    label: "Push to Talk",
    icon: "record_voice_over",
    action: combo("space"),
    note: "Turn on Push to talk in Meet's settings.",
  },

  // newer devices draw these looks themselves; older ones need them on the key
  {
    app: "mic",
    title: "Mute mic",
    label: "PC Mic",
    icon: "mic",
    action: { type: "app", app: "mic", op: "mute" },
    on: { icon: "mic_off", background: "#c62828" },
  },
  {
    app: "mic",
    title: "Push to talk (hold)",
    label: "PC Talk",
    icon: "record_voice_over",
    action: { type: "app", app: "mic", op: "push-to-talk" },
  },
];

export const meetingApp = (id: string) => meetingApps.find((m) => m.id === id);

// offered says whether s can go on a key: an app action only where the
// device or PC helper runs it.
export const offered = (s: Shortcut, f: Features | null) =>
  s.action.type !== "app" || !!f?.apps[s.action.app!]?.includes(s.action.op!);

// forPage is what a page for app gets: its shortcuts and, where it runs,
// the PC's mic mute.
export const forPage = (app: string, f: Features | null) =>
  shortcuts.filter((s) => (s.app === app || (s.app === "mic" && s.action.op === "mute")) && offered(s, f));

const same = (a?: string[], b?: string[]) => (a ?? []).join("+") === (b ?? []).join("+");

// matching is the shortcuts action a does, e.g. both apps' push to talk.
export const matching = (a: Action) =>
  shortcuts.filter(
    ({ action: s }) =>
      s.type === a.type && s.app === a.app && s.op === a.op && same(s.keys, a.keys) && same(s.mac_keys, a.mac_keys),
  );

// giveShortcut makes a do s. Its look gets s's icon, label and app colour
// when it has no icon or image of its own, or still has the one the last
// shortcut gave it; a custom look stays. A look for the state's on goes on
// any key without one.
export function giveShortcut(a: Action, look: Look & { on?: Look }, s: Shortcut, logos: Logo[]) {
  const was = matching(a)[0];
  for (const k of Object.keys(a)) delete a[k as keyof Action];
  Object.assign(a, structuredClone(s.action));
  if (was?.on && JSON.stringify(look.on) === JSON.stringify(was.on)) delete look.on;
  if (s.on && !look.on) look.on = { ...s.on };
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

// fillPage puts the shortcuts page lacks on its empty keys, the first keys
// of a device with that many, and says how many it put.
export function fillPage(c: Config, page: string, keys: number, list: Shortcut[], logos: Logo[]): number {
  const p = c.pages[page];
  const have = Object.values(p.keys).flatMap((b) => matching(b.action));
  const todo = list.filter((s) => !have.includes(s));
  let n = 0;
  for (let k = 0; k < keys && n < todo.length; k++) {
    if (p.keys[k]) continue;
    const b: Button = { action: {} };
    giveShortcut(b.action, b, todo[n++], logos);
    p.keys[k] = b;
  }
  return n;
}
