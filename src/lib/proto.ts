// The config channel protocol, as in d200-deck's proto/raw.go and docs/api.md.
// Names follow the Go ones so the two are easy to compare.

// Input reports are 64 bytes (protocol 3) or 1024 (protocol 4). A reply's
// header has a 1-byte length in the first and a 2-byte one in the second,
// so each report is read by its size.
export const RawInSize = 64;
export const RawInSizeLarge = 1024;
export const RawOutSize = 1024;
export const MaxRequest = RawOutSize - 5;
export const MaxReply = RawInSize - 5;
export const MaxReplyLarge = RawInSizeLarge - 6;
export const MaxMessage = 64 << 10;

export const RawUsagePage = 0xffd2;
// The oldest protocol the site talks; protocol 4 adds 1024-byte input
// reports and gzipped config transfers.
export const Version = 3;
export const VersionLarge = 4;

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
} as const;

// How often clients send the time.
export const TimePeriod = 60 * 60_000;

// How long the device waits for a press when it asks about a change: a
// config that gives keys new actions, or a new USB network address. The
// reply comes after the press.
export const ConfirmTimeout = 60_000;

export const MaxConfigRead = 16384; // per config-read, protocol 3
export const MaxConfigReadLarge = 61440; // protocol 4
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
}

export interface ConfigInfo {
  rev: string;
  size: number;
  gzip_size?: number; // asked for with {"gzip": true}, protocol 4
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
  const large = b.length > RawInSize;
  const head = large ? 6 : 5;
  const n = large ? b[4] | (b[5] << 8) : b[4];
  if (b.length < head || n > b.length - head) throw new Error("bad reply");
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

// encodeReply splits a reply into input reports of size bytes.
export function encodeReply(
  seq: number,
  status: number,
  payload: Uint8Array = new Uint8Array(),
  size = RawInSize,
): Uint8Array[] {
  const large = size > RawInSize;
  const head = large ? 6 : 5;
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
    if (large) b[5] = n >> 8;
    b.set(payload.subarray(off, off + n), head);
    out.push(b);
    off += n;
  } while (off < payload.length);
  return out;
}
