import type { Action } from "./config";
import { formatCombo } from "./keys";

// What a key can do, in words for people. Types and fields are in
// d200-deck's docs/config.md.

export interface ActionType {
  type: string;
  name: string;
  pc?: boolean; // runs on the PC, through the PC helper
}

export const actionTypes: ActionType[] = [
  { type: "", name: "Nothing" },
  { type: "hid-key", name: "Key combo" },
  { type: "hid-consumer", name: "Media key" },
  { type: "type-text", name: "Type text" },
  { type: "macro", name: "Macro" },
  { type: "hid-system", name: "Sleep or power off" },
  { type: "page", name: "Open page" },
  { type: "back", name: "Go back" },
  { type: "home", name: "Go home" },
  { type: "open-url", name: "Open website", pc: true },
  { type: "launch", name: "Open program", pc: true },
  { type: "http", name: "Web request", pc: true },
  { type: "app", name: "App", pc: true },
];

// What may go where (deck.validateAction).
export const fallbackTypes = ["hid-key", "hid-consumer", "hid-system", "type-text", "macro"];
export const stepTypes = ["hid-key", "hid-consumer", "hid-system", "type-text", "delay"];

export const typeName = (t = "") =>
  t === "delay" ? "Wait" : (actionTypes.find((a) => a.type === t)?.name ?? t);

export const isPC = (t = "") => actionTypes.some((a) => a.type === t && a.pc);

export const usageNames: Record<string, string> = {
  "play-pause": "Play / pause",
  "next-track": "Next track",
  "prev-track": "Previous track",
  stop: "Stop",
  mute: "Mute",
  "volume-up": "Volume up",
  "volume-down": "Volume down",
};

export const systemNames: Record<string, string> = {
  sleep: "Sleep",
  "power-down": "Power off",
  "wake-up": "Wake up",
};

export const appNames: Record<string, string> = { discord: "Discord", obs: "OBS", media: "Media player" };

// Words for app ops, by app (d200-deck docs/discord.md, obs.md, media.md).
const opNames: Record<string, string> = {
  "discord.mute": "Mute",
  "discord.deafen": "Deafen",
  "discord.push-to-talk": "Push to talk",
  "discord.push-to-mute": "Push to mute",
  "discord.open": "Open Discord",
  "discord.channel": "Open a channel",
  "discord.join-voice": "Join a voice channel",
  "discord.leave-voice": "Leave voice",
  "discord.voice-mode": "Switch voice mode",
  "discord.noise-suppression": "Noise suppression",
  "discord.echo-cancellation": "Echo cancellation",
  "discord.auto-gain": "Automatic gain",
  "discord.input-volume-up": "Mic volume up",
  "discord.input-volume-down": "Mic volume down",
  "discord.output-volume-up": "Volume up",
  "discord.output-volume-down": "Volume down",
  "obs.scene": "Switch scene",
  "obs.stream": "Start or stop streaming",
  "obs.record": "Start or stop recording",
  "obs.pause-record": "Pause or resume recording",
  "obs.replay-buffer": "Start or stop the replay buffer",
  "obs.save-replay": "Save the replay",
  "obs.virtual-cam": "Start or stop the virtual camera",
  "obs.mute": "Mute an audio source",
  "media.play-pause": "Play or pause",
  "media.next": "Next track",
  "media.previous": "Previous track",
  "media.stop": "Stop",
  "media.shuffle": "Shuffle",
  "media.repeat": "Repeat",
  "media.now-playing": "Now playing",
};

export const opName = (app = "", op = "") => opNames[`${app}.${op}`] ?? op;

// describe says in a few words what a device action does, e.g. "ctrl +
// shift + m" or "the Play / pause key".
export function describe(a: Action): string {
  if (a.type === "hid-key") return formatCombo(a.keys ?? []);
  if (a.type === "hid-consumer") {
    const name = usageNames[String(a.usage)];
    return name ? `the ${name} key` : `media key ${a.usage}`;
  }
  return typeName(a.type);
}

// typeTextProblem says what the device won't type: it types ASCII, up to
// 1024 characters.
export function typeTextProblem(text = ""): string {
  const odd = [...new Set([...text].filter((c) => c > "~" || (c < " " && c !== "\n" && c !== "\t")))];
  if (odd.length) return `It can't type ${odd.join(" ")}: only plain letters, digits and symbols (ASCII).`;
  if (text.length > 1024) return "Up to 1024 characters.";
  return "";
}

const player = { name: "id", label: "Player (empty for the one playing)" };

// Ops that take args, and which.
export const opArgs: Record<string, { name: string; label: string; number?: boolean }[]> = {
  "discord.channel": [
    { name: "id", label: "Channel ID" },
    { name: "guild", label: "Server ID (empty for a DM)" },
  ],
  "discord.join-voice": [{ name: "id", label: "Voice channel ID" }],
  "discord.input-volume-up": [{ name: "step", label: "Step (default 10)", number: true }],
  "discord.input-volume-down": [{ name: "step", label: "Step (default 10)", number: true }],
  "discord.output-volume-up": [{ name: "step", label: "Step (default 10)", number: true }],
  "discord.output-volume-down": [{ name: "step", label: "Step (default 10)", number: true }],
  "obs.scene": [{ name: "id", label: "Scene name" }],
  "obs.mute": [{ name: "id", label: "Audio source name" }],
  ...Object.fromEntries(["play-pause", "next", "previous", "stop", "shuffle", "repeat", "now-playing"].map((op) => [`media.${op}`, [player]])),
};

// splitCommand splits a command line into words; quotes keep spaces.
export function splitCommand(s: string): string[] {
  const out: string[] = [];
  let word = "";
  let quote = "";
  let any = false;
  for (const c of s) {
    if (quote) {
      if (c === quote) quote = "";
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      any = true;
    } else if (/\s/.test(c)) {
      if (word || any) out.push(word);
      word = "";
      any = false;
    } else {
      word += c;
    }
  }
  if (word || any) out.push(word);
  return out;
}

export function joinCommand(words: string[] = []): string {
  const quote = (w: string) => {
    if (w !== "" && !/[\s"']/.test(w)) return w;
    return w.includes('"') ? `'${w}'` : `"${w}"`;
  };
  return words.map(quote).join(" ");
}
