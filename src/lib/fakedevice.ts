// FakeDevice plays the device end of the config channel in memory, for tests
// and for working on the site without a device. It keeps the config as bytes
// and doesn't check it the way the device does. It speaks protocol 4 (1024-
// byte reports, gzipped transfers); set hello.protocol to 3 for an older one.

import type { Transport } from "./conn";
import { sha256 } from "./conn";
import { gunzip, gzip } from "./gzip";
import {
  Cmd,
  decodeRequest,
  encodeReply,
  Event,
  EventSeq,
  type Hello,
  type HostInfo,
  ConfigReadGzip,
  MaxConfigRead,
  MaxConfigReadLarge,
  RawInSize,
  RawInSizeLarge,
  type Request,
  type Settings,
  Status,
  type Time,
  VersionLarge,
} from "./proto";

const text = new TextDecoder();
const bytes = (s: string) => new TextEncoder().encode(s);
const json = (v: unknown) => bytes(JSON.stringify(v));

export class FakeDevice implements Transport {
  onReport: ((report: Uint8Array) => void) | null = null;
  hello: Hello = {
    protocol: VersionLarge,
    firmware: "fake",
    os: { name: "fake" },
    serial: "0123456789abcdef",
    keys: 14,
    ipv4: "198.18.0.1",
  };
  host: HostInfo = { connected: false };
  settingsState: Settings = { usb_drive: true, usb_net4: "" };
  config: Uint8Array;
  identified: number[] = []; // -1: the whole screen
  // flashes the whole screen on an empty identify; older devices don't
  canFlash = true;
  // requests the device answers with status Unknown command, e.g. to act as an older device
  unknown = new Set<number>();
  // set to drop replies, as a device that went away
  silent = false;
  // the times it was sent, in Unix ms
  times: number[] = [];
  // refuses times before this, as a device does before its build time
  built = 0;
  // set to ask on the "screen" before a commit or a new USB address: the
  // answer comes after delay ms
  ask: { delay: number; yes: boolean } | null = null;
  private upload: { base: string; size: number; sha256: string; gzip_size?: number; b: number[] } | null = null;
  private gz: { rev: string; data: Uint8Array } | null = null;

  private get large() {
    return this.hello.protocol >= VersionLarge;
  }

  // the config gzipped, once per version, as the device keeps it
  private async gzipped(): Promise<Uint8Array> {
    const rev = await sha256(this.config);
    if (this.gz?.rev !== rev) this.gz = { rev, data: await gzip(this.config) };
    return this.gz.data;
  }

  constructor(config: unknown = { version: 1, home: "main", pages: { main: { keys: {} } } }) {
    this.config = json(config);
  }

  async send(report: Uint8Array) {
    const req = decodeRequest(report);
    const [status, payload] = await this.handle(req);
    if (!this.silent) this.reply(req.seq, status, payload);
  }

  async close() {}

  // event sends an event to the client.
  event(code: number, payload?: unknown) {
    this.reply(EventSeq, code, payload === undefined ? undefined : json(payload));
  }

  private reply(seq: number, status: number, payload?: Uint8Array) {
    const size = this.large ? RawInSizeLarge : RawInSize;
    for (const r of encodeReply(seq, status, payload, size)) setTimeout(() => this.onReport?.(r));
  }

  // asked waits for the answer when set to ask; "" for yes, else why not.
  private async asked(): Promise<string> {
    const a = this.ask;
    if (!a) return "";
    await new Promise((r) => setTimeout(r, a.delay));
    return a.yes ? "" : "cancelled on the device";
  }

  private async info() {
    return { rev: await sha256(this.config), size: this.config.length };
  }

  private async handle(req: Request): Promise<[number, Uint8Array?]> {
    const p = req.payload;
    const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
    if (this.unknown.has(req.cmd)) return [Status.UnknownCmd];
    switch (req.cmd) {
      case Cmd.Hello:
        return [Status.OK, json(this.hello)];
      case Cmd.Host:
        return [Status.OK, json(this.host)];
      case Cmd.Time: {
        const t = (JSON.parse(text.decode(p)) as Time).unix_ms;
        if (t < this.built) return [Status.Failed, bytes("time is before the build")];
        this.times.push(t);
        return [Status.OK];
      }
      case Cmd.Identify:
        if (p.length === 0 && this.canFlash) {
          this.identified.push(-1);
          return [Status.OK];
        }
        if (p.length !== 1 || p[0] >= this.hello.keys) return [Status.BadRequest];
        this.identified.push(p[0]);
        return [Status.OK];
      case Cmd.Settings: {
        const change = p.length > 0 ? (JSON.parse(text.decode(p)) as Settings) : {};
        if (change.usb_net4 !== undefined) {
          const why = await this.asked();
          if (why) return [Status.Failed, bytes(why)];
        }
        Object.assign(this.settingsState, change);
        return [Status.OK, json(this.settingsState)];
      }
      case Cmd.ConfigInfo: {
        const info = await this.info();
        if (this.large && p.length && JSON.parse(text.decode(p)).gzip) {
          return [Status.OK, json({ ...info, gzip_size: (await this.gzipped()).length })];
        }
        return [Status.OK, json(info)];
      }
      case Cmd.ConfigRead: {
        if (p.length !== 6 && !(this.large && p.length === 7)) return [Status.BadRequest];
        const n = v.getUint16(4, true) || 4096;
        if (n > (this.large ? MaxConfigReadLarge : MaxConfigRead)) return [Status.BadRequest];
        const src = p.length === 7 && p[6] & ConfigReadGzip ? await this.gzipped() : this.config;
        const off = Math.min(v.getUint32(0, true), src.length);
        return [Status.OK, src.slice(off, off + n)];
      }
      case Cmd.ConfigWrite:
        this.upload = { ...JSON.parse(text.decode(p)), b: [] };
        return [Status.OK];
      case Cmd.ConfigData: {
        const u = this.upload;
        if (!u || p.length < 4 || v.getUint32(0, true) !== u.b.length) return [Status.BadRequest];
        u.b.push(...p.subarray(4));
        return [Status.OK];
      }
      case Cmd.ConfigCommit: {
        const u = this.upload;
        this.upload = null;
        if (!u) return [Status.BadRequest];
        let b = new Uint8Array(u.b);
        if (this.large && u.gzip_size !== undefined) {
          if (b.length !== u.gzip_size) return [Status.Failed, bytes("the config arrived incomplete; send it again")];
          b = await gunzip(b, u.size).catch(() => new Uint8Array());
        }
        if (b.length !== u.size || (await sha256(b)) !== u.sha256) {
          return [Status.Failed, bytes("the config arrived incomplete or damaged; send it again")];
        }
        if (u.base !== "" && u.base !== (await this.info()).rev) {
          return [Status.Failed, bytes("the config changed since you read it; read it again")];
        }
        const why = await this.asked();
        if (why) return [Status.Failed, bytes(why)];
        this.config = b;
        const info = await this.info();
        this.event(Event.ConfigChanged, info);
        return [Status.OK, json(info)];
      }
    }
    return [Status.UnknownCmd];
  }
}
