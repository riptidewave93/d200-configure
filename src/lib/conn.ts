// A connection to the config channel, as d200-deck's proto/client.go and
// proto/config.go: one request at a time, and events from the device.

import {
  Cmd,
  ConfirmTimeout,
  type ConfigInfo,
  decodeReply,
  encodeRequest,
  EventSeq,
  type Hello,
  type HostInfo,
  MaxConfigData,
  MaxConfigRead,
  MaxMessage,
  type Settings,
  Status,
  type Time,
} from "./proto";

// Transport moves raw reports to and from the device.
export interface Transport {
  send(report: Uint8Array): Promise<void>;
  // set by Conn: called with each input report
  onReport: ((report: Uint8Array) => void) | null;
  close(): Promise<void>;
}

// DeviceError is a request the device refused; for StatusFailed the message
// is the device's own reason, meant for the user.
export class DeviceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type EventListener = (code: number, payload: Uint8Array) => void;

// Progress gets the bytes moved so far and the total.
export type Progress = (done: number, total: number) => void;

// Asking is called when the device seems to be asking on its screen: a
// request it may ask about hasn't been answered at once.
export type Asking = () => void;

interface Pending {
  seq: number;
  resolve: (payload: Uint8Array) => void;
  reject: (err: Error) => void;
}

const text = new TextDecoder();
const json = new TextEncoder();

export class Conn {
  private seq = crypto.getRandomValues(new Uint16Array(1))[0]; // other clients see our replies
  private queue: Promise<unknown> = Promise.resolve();
  private pending: Pending | null = null;
  private parts = new Map<number, { b: number[]; tooLarge: boolean }>();
  // Events queued in the device before we connected arrive ahead of the
  // first reply and are dropped.
  private synced = false;
  private listeners = new Set<EventListener>();
  private closed = false;

  constructor(
    private t: Transport,
    private timeout = 2000,
  ) {
    t.onReport = (b) => this.receive(b);
  }

  onEvent(f: EventListener): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  async close() {
    this.closed = true;
    this.pending?.reject(new Error("disconnected"));
    this.pending = null;
    await this.t.close();
  }

  private receive(b: Uint8Array) {
    let p;
    try {
      p = decodeReply(b);
    } catch {
      return;
    }
    if (p.first) this.parts.set(p.seq, { b: [], tooLarge: false }); // drops a message cut short
    const m = this.parts.get(p.seq);
    if (!m) return; // we missed the start
    if (!m.tooLarge) {
      m.b.push(...p.payload);
      if (m.b.length > MaxMessage) {
        m.b = [];
        m.tooLarge = true;
      }
    }
    if (p.more) return;
    this.parts.delete(p.seq);
    if (m.tooLarge) return;
    const msg = new Uint8Array(m.b);
    if (p.seq === EventSeq) {
      if (this.synced) for (const f of this.listeners) f(p.status, msg);
      return;
    }
    const w = this.pending;
    if (!w || w.seq !== p.seq) return; // another client's, or a late reply
    this.pending = null;
    this.synced = true;
    if (p.status === Status.OK) w.resolve(msg);
    else if (p.status === Status.Failed) w.reject(new DeviceError(p.status, text.decode(msg)));
    else w.reject(new DeviceError(p.status, `device: status ${p.status}`));
  }

  // request sends one request and waits for its reply, up to wait ms.
  request(cmd: number, payload?: Uint8Array, wait = this.timeout): Promise<Uint8Array> {
    const run = () => this.send(cmd, payload, wait);
    const r = this.queue.then(run, run);
    this.queue = r.catch(() => {});
    return r;
  }

  // askable sends a request the device may ask the user about first: it
  // waits for the press, and calls asking if the reply doesn't come at once.
  private askable(cmd: number, payload?: Uint8Array, asking?: Asking): Promise<Uint8Array> {
    const t = asking ? setTimeout(asking, Math.min(1000, this.timeout)) : undefined;
    return this.request(cmd, payload, ConfirmTimeout + this.timeout).finally(() => clearTimeout(t));
  }

  private send(cmd: number, payload: Uint8Array | undefined, wait: number): Promise<Uint8Array> {
    if (this.closed) return Promise.reject(new Error("disconnected"));
    this.seq = (this.seq + 1) & 0xffff;
    if (this.seq === EventSeq) this.seq++;
    const seq = this.seq;
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.seq === seq) this.pending = null;
        reject(new Error("The device didn't answer."));
      }, wait);
      const done = <T>(f: (v: T) => void) => (v: T) => {
        clearTimeout(timer);
        f(v);
      };
      this.pending = { seq, resolve: done(resolve), reject: done(reject) };
      this.t.send(encodeRequest(seq, cmd, payload)).catch((err) => {
        if (this.pending?.seq === seq) this.pending = null;
        done(reject)(err);
      });
    });
  }

  private async requestJSON<T>(cmd: number, body?: unknown): Promise<T> {
    const b = await this.request(cmd, body === undefined ? undefined : json.encode(JSON.stringify(body)));
    return JSON.parse(text.decode(b)) as T;
  }

  hello() {
    return this.requestJSON<Hello>(Cmd.Hello);
  }

  host() {
    return this.requestJSON<HostInfo>(Cmd.Host);
  }

  // time sets the device's clock to now.
  async time() {
    await this.request(Cmd.Time, json.encode(JSON.stringify({ unix_ms: Date.now() } satisfies Time)));
  }

  // settings reads the settings, or changes the ones given. The device
  // asks before changing the USB network address.
  async settings(change?: Settings, asking?: Asking): Promise<Settings> {
    if (change?.usb_net4 === undefined) return this.requestJSON<Settings>(Cmd.Settings, change);
    const b = await this.askable(Cmd.Settings, json.encode(JSON.stringify(change)), asking);
    return JSON.parse(text.decode(b)) as Settings;
  }

  async identify(key: number) {
    await this.request(Cmd.Identify, new Uint8Array([key]));
  }

  configInfo() {
    return this.requestJSON<ConfigInfo>(Cmd.ConfigInfo);
  }

  // readConfig reads the config file and names its version.
  async readConfig(progress?: Progress): Promise<{ data: Uint8Array; info: ConfigInfo }> {
    const info = await this.configInfo();
    const data = new Uint8Array(info.size);
    let n = 0;
    progress?.(0, info.size);
    while (n < info.size) {
      const req = new Uint8Array(6);
      const v = new DataView(req.buffer);
      v.setUint32(0, n, true);
      v.setUint16(4, MaxConfigRead, true);
      const part = await this.request(Cmd.ConfigRead, req);
      if (part.length === 0) break;
      data.set(part.subarray(0, info.size - n), n);
      n += part.length;
      progress?.(Math.min(n, info.size), info.size);
    }
    if (n < info.size || (await sha256(data)) !== info.rev) {
      throw new Error("The config changed while it was read. Read it again.");
    }
    return { data, info };
  }

  // writeConfig replaces the config with data, if it's still version base
  // ("" replaces any). If it gives keys new actions, the device asks first.
  async writeConfig(base: string, data: Uint8Array, progress?: Progress, asking?: Asking): Promise<ConfigInfo> {
    const start = { base, size: data.length, sha256: await sha256(data) };
    await this.request(Cmd.ConfigWrite, json.encode(JSON.stringify(start)));
    progress?.(0, data.length);
    for (let off = 0; off < data.length; off += MaxConfigData) {
      const chunk = data.subarray(off, off + MaxConfigData);
      const part = new Uint8Array(4 + chunk.length);
      new DataView(part.buffer).setUint32(0, off, true);
      part.set(chunk, 4);
      await this.request(Cmd.ConfigData, part);
      progress?.(off + chunk.length, data.length);
    }
    return JSON.parse(text.decode(await this.askable(Cmd.ConfigCommit, undefined, asking))) as ConfigInfo;
  }
}

export async function sha256(b: Uint8Array): Promise<string> {
  const sum = new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource));
  return Array.from(sum, (x) => x.toString(16).padStart(2, "0")).join("");
}
