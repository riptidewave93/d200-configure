import { describe, expect, it } from "vitest";
import { Conn, DeviceError, sha256 } from "./conn";
import { FakeDevice } from "./fakedevice";
import { Cmd, decodeReply, decodeRequest, encodeReply, encodeRequest, Event, MaxReply, RawOutSize } from "./proto";

describe("framing", () => {
  it("round-trips a request", () => {
    const b = encodeRequest(0x1234, Cmd.Hello, new Uint8Array([1, 2, 3]));
    expect(b.length).toBe(RawOutSize);
    expect(decodeRequest(b)).toEqual({ seq: 0x1234, cmd: Cmd.Hello, payload: new Uint8Array([1, 2, 3]) });
  });

  it("splits a long reply into reports", () => {
    const payload = new Uint8Array(MaxReply * 2 + 1).map((_, i) => i);
    const parts = encodeReply(7, 0, payload).map(decodeReply);
    expect(parts.map((p) => [p.first, p.more])).toEqual([
      [true, true],
      [false, true],
      [false, false],
    ]);
    expect(new Uint8Array(parts.flatMap((p) => [...p.payload]))).toEqual(payload);
  });

  it("reads 1024-byte reports with a 2-byte length", () => {
    const payload = new Uint8Array(1500).map((_, i) => i);
    const parts = encodeReply(9, 0, payload, 1024).map(decodeReply);
    expect(parts.map((p) => p.payload.length)).toEqual([1018, 482]);
    expect(new Uint8Array(parts.flatMap((p) => [...p.payload]))).toEqual(payload);
  });

  it("sends one report for an empty reply", () => {
    const [p] = encodeReply(7, 3).map(decodeReply);
    expect(p).toMatchObject({ seq: 7, status: 3, first: true, more: false });
  });
});

function connect(dev = new FakeDevice()) {
  return { dev, conn: new Conn(dev, 200) };
}

describe("Conn", () => {
  it("says hello", async () => {
    const { conn } = connect();
    expect((await conn.hello()).keys).toBe(14);
  });

  it("ignores replies to other clients and late replies", async () => {
    const { dev, conn } = connect();
    await conn.hello();
    // another client's reply arrives first, with a seq we never sent
    const send = dev.send.bind(dev);
    dev.send = async (r) => {
      const seq = decodeRequest(r).seq;
      for (const b of encodeReply((seq + 100) & 0xffff, 0, new TextEncoder().encode('"not ours"'))) dev.onReport?.(b);
      return send(r);
    };
    expect((await conn.hello()).serial).toBe(dev.hello.serial);
  });

  it("drops events from before the first reply", async () => {
    const { dev, conn } = connect();
    const keys: number[] = [];
    conn.onEvent((code, p) => code === Event.Key && keys.push(JSON.parse(new TextDecoder().decode(p)).key));
    dev.event(Event.Key, { key: 1 });
    await conn.hello();
    dev.event(Event.Key, { key: 2 });
    await conn.hello();
    expect(keys).toEqual([2]);
  });

  it("runs one request at a time", async () => {
    const { dev, conn } = connect();
    let unanswered = 0;
    let most = 0;
    const send = dev.send.bind(dev);
    dev.send = (r) => {
      most = Math.max(most, ++unanswered);
      return send(r);
    };
    const receive = dev.onReport!;
    dev.onReport = (r) => {
      if (!decodeReply(r).more) unanswered--;
      receive(r);
    };
    await Promise.all([conn.hello(), conn.host(), conn.settings(), conn.identify(3)]);
    expect(most).toBe(1);
    expect(dev.identified).toEqual([3]);
  });

  it("times out, then keeps working", async () => {
    const { dev, conn } = connect();
    dev.silent = true;
    await expect(conn.hello()).rejects.toThrow("didn't answer");
    dev.silent = false;
    expect((await conn.hello()).keys).toBe(14);
  });

  it("reports an unknown command", async () => {
    const { dev, conn } = connect();
    dev.unknown.add(Cmd.Host);
    await expect(conn.host()).rejects.toMatchObject({ status: 1 });
  });

  it("sends the time", async () => {
    const { dev, conn } = connect();
    await conn.time();
    expect(Math.abs(dev.times[0] - Date.now())).toBeLessThan(1000);
  });

  it("changes settings", async () => {
    const { conn } = connect();
    expect(await conn.settings({ usb_drive: false })).toMatchObject({ usb_drive: false });
  });
});

// Protocol 3 moves configs as they are in 64-byte reports; 4 gzips them,
// in 1024-byte reports.
describe.each([3, 4])("config, protocol %i", (protocol) => {
  async function open(dev = new FakeDevice()) {
    dev.hello.protocol = protocol;
    const c = connect(dev);
    await c.conn.hello();
    return c;
  }

  // big enough to need several reads and many writes
  const big = { version: 1, home: "main", pages: { main: { keys: {} } }, images: { a: "x".repeat(100_000) } };

  it("reads the config", async () => {
    const { dev, conn } = await open(new FakeDevice(big));
    const seen: number[] = [];
    const { data, info } = await conn.readConfig((n) => seen.push(n));
    expect(JSON.parse(new TextDecoder().decode(data))).toEqual(big);
    expect(info.rev).toBe(await sha256(dev.config));
    expect(seen.at(-1)).toBe(protocol === 4 ? info.gzip_size : info.size);
  });

  it("reads the config as it is while the device is still gzipping it", async () => {
    const { dev, conn } = await open(new FakeDevice(big));
    dev.gzipping = true;
    const seen: number[] = [];
    const { data, info } = await conn.readConfig((n) => seen.push(n));
    expect(JSON.parse(new TextDecoder().decode(data))).toEqual(big);
    expect(info.gzip_size).toBeUndefined();
    expect(seen.at(-1)).toBe(info.size);
  });

  it("writes the config as it is while the device is still gzipping", async () => {
    const { dev, conn } = await open();
    dev.gzipping = true;
    let sent = 0;
    const send = dev.send.bind(dev);
    dev.send = (r) => {
      const req = decodeRequest(r);
      if (req.cmd === Cmd.ConfigData) sent += req.payload.length - 4;
      return send(r);
    };
    const data = new TextEncoder().encode(JSON.stringify(big));
    await conn.writeConfig("", data);
    expect(dev.config).toEqual(data);
    expect(sent).toBe(data.length);
  });

  it("moves less when gzipped", async () => {
    const { dev, conn } = await open();
    let sent = 0;
    const send = dev.send.bind(dev);
    dev.send = (r) => {
      const req = decodeRequest(r);
      if (req.cmd === Cmd.ConfigData) sent += req.payload.length - 4;
      return send(r);
    };
    const data = new TextEncoder().encode(JSON.stringify(big));
    await conn.writeConfig("", data);
    expect(dev.config).toEqual(data);
    if (protocol === 4) expect(sent).toBeLessThan(data.length / 10);
    else expect(sent).toBe(data.length);
  });

  it("writes the config and sends config-changed", async () => {
    const { dev, conn } = await open();
    const { info } = await conn.readConfig();
    const changed: string[] = [];
    conn.onEvent((code, p) => code === Event.ConfigChanged && changed.push(JSON.parse(new TextDecoder().decode(p)).rev));
    const data = new TextEncoder().encode(JSON.stringify(big));
    const saved = await conn.writeConfig(info.rev, data);
    expect(dev.config).toEqual(data);
    expect(saved.rev).toBe(await sha256(data));
    await conn.hello(); // lets the event arrive
    expect(changed).toEqual([saved.rev]);
  });

  it("waits while the device asks, and says it's asking", async () => {
    const { dev, conn } = await open();
    dev.ask = { delay: 600, yes: true }; // past the 200 ms reply timeout
    let asked = 0;
    const data = new TextEncoder().encode(JSON.stringify(big));
    await conn.writeConfig("", data, undefined, () => asked++);
    expect(asked).toBe(1);
    expect(dev.config).toEqual(data);
  });

  it("fails when the device's question is cancelled", async () => {
    const { dev, conn } = await open();
    dev.ask = { delay: 10, yes: false };
    await expect(conn.writeConfig("", new TextEncoder().encode("{}"))).rejects.toThrow("cancelled on the device");
    await expect(conn.settings({ usb_net4: "10.0.0.4" })).rejects.toThrow("cancelled on the device");
    expect(await conn.settings({ usb_drive: false })).toMatchObject({ usb_drive: false }); // never asked
  });

  it("refuses a write over a config that changed", async () => {
    const { dev, conn } = await open();
    const { info } = await conn.readConfig();
    dev.config = new TextEncoder().encode('{"changed": true}');
    const err = await conn.writeConfig(info.rev, new TextEncoder().encode("{}")).catch((e) => e);
    expect(err).toBeInstanceOf(DeviceError);
    expect(err.message).toBe("the config changed since you read it; read it again");
  });
});
