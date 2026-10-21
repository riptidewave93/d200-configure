import type { Action, Config, Look } from "./config";
import type { HostInfo } from "./proto";
import { giveLogo, type Logo } from "./logos";

// "Open app" keys: {"type": "app", "app": "programs", "op": "open", "args":
// {"id": "chrome"}}. The PC helper opens only the ids in its own list
// (d200-deck docs/api.md), so these are the same ids, each with its look: an
// app logo (logos.json) or, where there's none, a device icon.

export const appPrograms = "programs";

export interface Program {
  id: string;
  title: string;
  group: string;
  logo?: string; // a logo's name in logos.json
  icon?: string; // a device icon's name
}

const sys = (id: string, title: string, icon: string): Program => ({ id, title, group: "System", icon });
const of =
  (group: string) =>
  (id: string, title: string, logo = id): Program => ({ id, title, group, logo });
const [browser, chat, game, media, creative, work] = ["Browsers", "Chat", "Games", "Media", "Creative", "Work"].map(of);

export const programs: Program[] = [
  sys("files", "Files", "folder"),
  sys("settings", "Settings", "settings"),
  sys("terminal", "Terminal", "terminal"),
  sys("task-manager", "Task Manager", "monitoring"),
  sys("calculator", "Calculator", "calculate"),
  sys("text-editor", "Text Editor", "edit_note"),
  sys("screenshot", "Screenshot", "screenshot_region"),
  sys("control-panel", "Control Panel", "tune"),

  browser("chrome", "Chrome", "googlechrome"),
  browser("firefox", "Firefox", "firefoxbrowser"),
  browser("edge", "Edge", "microsoft-edge"),
  browser("brave", "Brave"),
  browser("opera", "Opera"),
  browser("vivaldi", "Vivaldi"),

  chat("discord", "Discord"),
  chat("telegram", "Telegram"),
  chat("whatsapp", "WhatsApp"),
  chat("signal", "Signal"),
  chat("zoom", "Zoom"),
  chat("slack", "Slack"),
  chat("teams", "Teams", "microsoft-teams"),

  game("steam", "Steam"),
  game("epic-games", "Epic Games", "epicgames"),
  game("battle-net", "Battle.net", "battledotnet"),
  game("gog-galaxy", "GOG Galaxy", "gogdotcom"),
  game("ea-app", "EA app", "ea"),
  game("ubisoft-connect", "Ubisoft Connect", "ubisoft"),
  game("riot-client", "Riot Client", "riotgames"),

  media("spotify", "Spotify"),
  media("vlc", "VLC", "vlcmediaplayer"),
  media("plex", "Plex"),
  media("kodi", "Kodi"),
  media("obs", "OBS Studio"),

  creative("photoshop", "Photoshop", "adobe-photoshop"),
  creative("gimp", "GIMP"),
  // Inkscape's logo is CC-BY-SA-3.0, which can't ship with the site
  { id: "inkscape", title: "Inkscape", group: "Creative", icon: "draw" },
  creative("krita", "Krita"),
  creative("blender", "Blender", "blender-logo"),
  creative("davinci-resolve", "DaVinci Resolve", "davinciresolve"),
  creative("audacity", "Audacity"),
  creative("figma", "Figma"),

  work("word", "Word", "microsoft-word"),
  work("excel", "Excel", "microsoft-excel"),
  work("powerpoint", "PowerPoint", "microsoft-powerpoint"),
  work("outlook", "Outlook", "microsoft-outlook"),
  work("libreoffice", "LibreOffice"),
  work("thunderbird", "Thunderbird"),
  work("notion", "Notion"),
  work("obsidian", "Obsidian"),
  work("1password", "1Password"),
  work("bitwarden", "Bitwarden"),
  work("vscode", "VS Code"),
];

export const program = (id: unknown) => programs.find((p) => p.id === id);

// isOpenApp says whether a is an "Open app" action.
export const isOpenApp = (a: Action) => a.type === "app" && a.app === appPrograms;

// found is the ids the PC helper found on the PC, or null while it can't
// say (not running, too old, or still looking).
export function found(host?: HostInfo | null): Set<string> | null {
  const s = host?.connected ? host.state : undefined;
  if (!s?.[`${appPrograms}.ready`]) return null;
  const pre = `${appPrograms}.available:`;
  return new Set(Object.keys(s).filter((k) => k.startsWith(pre) && s[k]).map((k) => k.slice(pre.length)));
}

// The look a program gives a key.
const iconOf = (p: Program) => p.logo ?? p.icon!;

// giveLook gives look p's icon, colours and title, when it has no icon or
// image of its own, or still has the one the last program (was) gave it. A
// custom look stays.
export function giveLook(c: Config, look: Look, p: Program, was: Program | undefined, logos: Logo[]) {
  const ours = was && look.icon === iconOf(was);
  if (!ours && (look.icon || look.image)) return;
  if (ours) {
    delete look.color;
    delete look.background;
  }
  if (!look.label || (ours && look.label === was.title)) look.label = p.title;
  const logo = p.logo ? logos.find((l) => l.name === p.logo) : undefined;
  if (logo) giveLogo(c, look, logo);
  else look.icon = iconOf(p);
}
