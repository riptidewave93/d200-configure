// The config channel protocol, as in d200-deck's proto/raw.go and docs/api.md.
// Names follow the Go ones so the two are easy to compare.

import type { Features } from "./features";

// Reports are 1024 bytes each way.
export const RawInSize = 1024;
export const RawOutSize = 1024;
export const MaxRequest = RawOutSize - 5;
export const MaxReply = RawInSize - 6;
export const MaxMessage = 64 << 10;

export const RawUsagePage = 0xffd2;
// The newest protocol the site talks, and the oldest: a device below
// MinVersion needs updating, and one above Version has newer software than
// the page.
export const Version = 4;
export const MinVersion = 4;

export const Cmd = {
  Hello: 0x01,
  Identify: 0x03,
  Settings: 0x07,
  ConfigInfo: 0x08,
  ConfigRead: 0x09,
  ConfigWrite: 0x0a,
  ConfigData: 0x0b,
  ConfigCommit: 0x0c,
  Host: 0x0d,
  // sets the device's clock: it has no battery-backed one
  Time: 0x0e,
  Reset: 0x11, // erases the keys and settings, then restarts; asked on the device
} as const;

// How often clients send the time.
export const TimePeriod = 60 * 60_000;

// How long the device waits for a press when it asks about a change: a
// config that gives keys new actions, or a new USB network address. The
// reply comes after the press.
export const ConfirmTimeout = 60_000;

export const MaxConfigRead = 61440; // per config-read
export const ConfigReadGzip = 0x01; // config-read flag: read the gzip stream
export const MaxConfigData = MaxRequest - 4;

export const EventSeq = 0;

export const Event = {
  Action: 0x01,
  USBRebinding: 0x02,
  ConfigChanged: 0x03,
  Key: 0x04,
} as const;

export const Status = {
  OK: 0x00,
  UnknownCmd: 0x01,
  BadRequest: 0x02,
  Failed: 0x03,
} as const;

export const FlagMore = 0x01;
export const FlagFirst = 0x02;

export interface Hello {
  protocol: number;
  firmware: string;
  os: { name?: string; version?: string; flavour?: string; build?: string };
  serial: string;
  keys: number;
  model?: string; // e.g. "ulanzi,d200", its device tree's first compatible; older devices don't send it
  ipv4?: string;
  features?: Features; // what its software supports; older software doesn't send it
}

export interface HostApp {
  name: string;
  title: string;
  status?: string; // missing: not set up yet
  ops?: string[];
}

export interface HostInfo {
  connected: boolean;
  name?: string;
  version?: string;
  os?: string;
  apps?: HostApp[];
  state?: Record<string, boolean>;
}

// The time now, for Cmd.Time.
export interface Time {
  unix_ms: number;
}

export interface Settings {
  usb_drive?: boolean;
  usb_net4?: string; // "" is the default address
  brightness?: number; // percent, brightness_min to 100; absent if it can't be set
  brightness_min?: number; // read only
  // while the computer sleeps: the screen dimmed with a sleep mark, or off;
  // absent on older software and screens that can't dim
  sleep_screen?: "zzz" | "off";
  host_os?: "mac" | "other" | ""; // the computer, "" if not known: Macs get keys' mac_keys
  // where the picture sits on the screen, in pixels (x right, y down); the
  // device clamps it to min and max, which are read only
  screen_offset?: Offset;
  screen_offset_min?: Offset;
  screen_offset_max?: Offset;
  // the alignment pattern: not saved, and it ends by itself a minute after
  // the last change
  screen_pattern?: boolean;
  // device keys only send key events, no actions: while the site is open
  // and seen; not saved, and it ends by itself if not sent again
  editing?: boolean;
  // the screen's panel: picked at start ("auto") or set; the device restarts
  // to apply a change. panel_active, read only, is the one in use. Absent on
  // older software.
  panel?: "auto" | Panel;
  panel_active?: Panel;
}

export type Panel = "h1" | "h3";

export interface Offset {
  x: number;
  y: number;
}

export interface ConfigInfo {
  rev: string;
  size: number;
  gzip_size?: number; // asked for with {"gzip": true}; absent until the device has it gzipped
}

export interface KeyEvent {
  key: number;
  release?: boolean;
}

export function encodeRequest(seq: number, cmd: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  if (payload.length > MaxRequest) throw new Error("request too long");
  const b = new Uint8Array(RawOutSize);
  const v = new DataView(b.buffer);
  v.setUint16(0, seq, true);
  b[2] = cmd;
  v.setUint16(3, payload.length, true);
  b.set(payload, 5);
  return b;
}

export interface ReplyPart {
  seq: number;
  status: number;
  first: boolean;
  more: boolean;
  payload: Uint8Array;
}

export function decodeReply(b: Uint8Array): ReplyPart {
  const head = 6;
  if (b.length < head) throw new Error("bad reply");
  const n = b[4] | (b[5] << 8);
  if (n > b.length - head) throw new Error("bad reply");
  return {
    seq: b[0] | (b[1] << 8),
    status: b[2],
    first: (b[3] & FlagFirst) !== 0,
    more: (b[3] & FlagMore) !== 0,
    payload: b.subarray(head, head + n),
  };
}

// The device end, for tests and the fake device.

export interface Request {
  seq: number;
  cmd: number;
  payload: Uint8Array;
}

export function decodeRequest(b: Uint8Array): Request {
  if (b.length < 5) throw new Error("short request");
  const n = b[3] | (b[4] << 8);
  if (n > b.length - 5) throw new Error("bad request length");
  return { seq: b[0] | (b[1] << 8), cmd: b[2], payload: b.slice(5, 5 + n) };
}

// encodeReply splits a reply into input reports.
export function encodeReply(seq: number, status: number, payload: Uint8Array = new Uint8Array()): Uint8Array[] {
  const size = RawInSize;
  const head = 6;
  const out: Uint8Array[] = [];
  let off = 0;
  do {
    const n = Math.min(payload.length - off, size - head);
    const b = new Uint8Array(size);
    b[0] = seq & 0xff;
    b[1] = seq >> 8;
    b[2] = status;
    b[3] = (off === 0 ? FlagFirst : 0) | (off + n < payload.length ? FlagMore : 0);
    b[4] = n & 0xff;
    b[5] = n >> 8;
    b.set(payload.subarray(off, off + n), head);
    out.push(b);
    off += n;
  } while (off < payload.length);
  return out;
}
