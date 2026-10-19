// The config channel protocol, as in d200-deck's proto/raw.go and docs/api.md.
// Names follow the Go ones so the two are easy to compare.

export const RawInSize = 64;
export const RawOutSize = 1024;
export const MaxRequest = RawOutSize - 5;
export const MaxReply = RawInSize - 5;
export const MaxMessage = 64 << 10;

export const RawUsagePage = 0xffd2;
export const Version = 3;

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
} as const;

export const MaxConfigRead = 16384;
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
  model?: string; // e.g. "ulanzi,d200"; older devices don't send it
  ipv4?: string;
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

export interface Settings {
  usb_drive?: boolean;
  usb_net4?: string; // "" is the default address
}

export interface ConfigInfo {
  rev: string;
  size: number;
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
  if (b.length < 5 || b[4] > b.length - 5) throw new Error("bad reply");
  return {
    seq: b[0] | (b[1] << 8),
    status: b[2],
    first: (b[3] & FlagFirst) !== 0,
    more: (b[3] & FlagMore) !== 0,
    payload: b.subarray(5, 5 + b[4]),
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

export function encodeReply(seq: number, status: number, payload: Uint8Array = new Uint8Array()): Uint8Array[] {
  const out: Uint8Array[] = [];
  let off = 0;
  do {
    const n = Math.min(payload.length - off, MaxReply);
    const b = new Uint8Array(RawInSize);
    b[0] = seq & 0xff;
    b[1] = seq >> 8;
    b[2] = status;
    b[3] = (off === 0 ? FlagFirst : 0) | (off + n < payload.length ? FlagMore : 0);
    b[4] = n;
    b.set(payload.subarray(off, off + n), 5);
    out.push(b);
    off += n;
  } while (off < payload.length);
  return out;
}
