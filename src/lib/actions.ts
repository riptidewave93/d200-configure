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
  mute: "Mute",
  "volume-up": "Volume up",
  "volume-down": "Volume down",
};

export const systemNames: Record<string, string> = {
  sleep: "Sleep",
  "power-down": "Power off",
  "wake-up": "Wake up",
};

export const appNames: Record<string, string> = { discord: "Discord" };

// Words for app ops, from docs/discord.md.
export const opNames: Record<string, string> = {
  mute: "Mute",
  deafen: "Deafen",
  "push-to-talk": "Push to talk",
  "push-to-mute": "Push to mute",
  open: "Open Discord",
  channel: "Open a channel",
  "join-voice": "Join a voice channel",
  "leave-voice": "Leave voice",
  "voice-mode": "Switch voice mode",
  "noise-suppression": "Noise suppression",
  "echo-cancellation": "Echo cancellation",
  "auto-gain": "Automatic gain",
  "input-volume-up": "Mic volume up",
  "input-volume-down": "Mic volume down",
  "output-volume-up": "Volume up",
  "output-volume-down": "Volume down",
};

// Ops that take args, and which (docs/discord.md).
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
