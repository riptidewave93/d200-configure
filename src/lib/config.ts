// The config file, as d200-deck's deck package and docs/config.md. Edits
// change these objects in place, so fields the site doesn't know survive a
// save.

export interface Config {
  version: number;
  home: string;
  pages: Record<string, Page>;
  // the icons keys show, by name: catalog icons are copied in when saving
  icons?: Record<string, IconEntry>;
  images?: Record<string, string>; // base64 PNG or JPEG by ID, drawn filling the key
  fonts?: Record<string, string>; // base64 TTF or OTF by ID
}

// An icon: an SVG path drawn in the key's colour, or a small PNG (emoji).
export interface IconEntry {
  d?: string;
  viewBox?: string;
  png?: string; // base64, at most MaxIconSide px square and MaxIconBytes
}

export const MaxIconSide = 128;
export const MaxIconBytes = 24 << 10;
// a custom image: PNG, JPEG or GIF
export const MaxImageBytes = 256 << 10;
// a custom font: TrueType or OpenType
export const MaxFontBytes = 512 << 10;

export interface Page {
  keys: Record<string, Button>; // by key number
}

export interface Look {
  icon?: string;
  image?: string;
  label?: string;
  font?: string;
  color?: string;
  background?: string;
}

export interface Button extends Look {
  action: Action;
  on?: Look;
}

export interface Action {
  type?: string;
  usage?: string | number;
  system?: string;
  page?: string;
  keys?: string[];
  text?: string;
  steps?: Action[];
  ms?: number;
  url?: string;
  command?: string[];
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  app?: string;
  op?: string;
  args?: Record<string, unknown>;
  fallback?: Action;
}

export const ConfigVersion = 1;

export const MaxConfigBytes = 2 << 20;

export function emptyConfig(): Config {
  return { version: ConfigVersion, home: "main", pages: { main: { keys: {} } } };
}

export function parse(data: Uint8Array): Config {
  return JSON.parse(new TextDecoder().decode(data)) as Config;
}

export function encode(c: Config): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(c));
}
