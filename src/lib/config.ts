// The config file, as d200-deck's deck package and docs/config.md. Edits
// change these objects in place, so fields the site doesn't know survive a
// save.

export interface Config {
  version: number;
  home: string;
  pages: Record<string, Page>;
  images?: Record<string, string>; // base64 PNG or JPEG by ID
  fonts?: Record<string, string>; // base64 TTF or OTF by ID
}

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
