// FakeDevice plays the device end of the config channel in memory, for tests
// and for working on the site without a device. It keeps the config as bytes
// and doesn't check it the way the device does.

import type { Transport } from "./conn";
import { sha256 } from "./conn";
import {
  Cmd,
  decodeRequest,
  encodeReply,
  Event,
  EventSeq,
  type Hello,
  type HostInfo,
  MaxConfigRead,
  type Request,
  type Settings,
  Status,
  Version,
} from "./proto";

const text = new TextDecoder();
const bytes = (s: string) => new TextEncoder().encode(s);
const json = (v: unknown) => bytes(JSON.stringify(v));

export class FakeDevice implements Transport {
  onReport: ((report: Uint8Array) => void) | null = null;
  hello: Hello = {
    protocol: Version,
    firmware: "fake",
    os: { name: "fake" },
    serial: "0123456789abcdef",
    keys: 14,
    ipv4: "198.18.0.1",
  };
  host: HostInfo = { connected: false };
  settingsState: Settings = { usb_drive: true, usb_net4: "" };
  config: Uint8Array;
  identified: number[] = [];
  // requests the device answers with status Unknown command, e.g. to act as an older device
  unknown = new Set<number>();
  // set to drop replies, as a device that went away
  silent = false;
  private upload: { base: string; size: number; sha256: string; b: number[] } | null = null;

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
    for (const r of encodeReply(seq, status, payload)) setTimeout(() => this.onReport?.(r));
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
      case Cmd.Identify:
        if (p.length !== 1 || p[0] >= this.hello.keys) return [Status.BadRequest];
        this.identified.push(p[0]);
        return [Status.OK];
      case Cmd.Settings:
        if (p.length > 0) Object.assign(this.settingsState, JSON.parse(text.decode(p)));
        return [Status.OK, json(this.settingsState)];
      case Cmd.ConfigInfo:
        return [Status.OK, json(await this.info())];
      case Cmd.ConfigRead: {
        if (p.length !== 6) return [Status.BadRequest];
        const n = v.getUint16(4, true) || 4096;
        if (n > MaxConfigRead) return [Status.BadRequest];
        const off = Math.min(v.getUint32(0, true), this.config.length);
        return [Status.OK, this.config.slice(off, off + n)];
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
        const b = new Uint8Array(u.b);
        if (b.length !== u.size || (await sha256(b)) !== u.sha256) {
          return [Status.Failed, bytes("the config arrived incomplete or damaged; send it again")];
        }
        if (u.base !== "" && u.base !== (await this.info()).rev) {
          return [Status.Failed, bytes("the config changed since you read it; read it again")];
        }
        this.config = b;
        const info = await this.info();
        this.event(Event.ConfigChanged, info);
        return [Status.OK, json(info)];
      }
    }
    return [Status.UnknownCmd];
  }
}
