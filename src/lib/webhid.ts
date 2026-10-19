// The config channel over WebHID: the device's vendor HID interface.

import type { Transport } from "./conn";
import { RawUsagePage } from "./proto";

export const supported = () => typeof navigator !== "undefined" && "hid" in navigator;

interface Brands {
  userAgentData?: { brands?: { brand: string }[] };
}

// browserWarning is what to tell people whose browser isn't Chrome or Edge,
// or "" for Chrome and Edge.
export function browserWarning(nav: Navigator & Brands = navigator): string {
  if (!("hid" in nav)) {
    return "This browser can't connect to the device. Use Chrome or Edge on a computer. You can still open and save config files.";
  }
  const brands = nav.userAgentData?.brands?.map((b) => b.brand) ?? [];
  if (!brands.some((b) => b === "Google Chrome" || b === "Microsoft Edge")) {
    return "This site is made for Chrome and Edge. In other browsers it may not connect to the device.";
  }
  return "";
}

const isChannel = (d: HIDDevice) => d.collections.some((c) => c.usagePage === RawUsagePage);

// pick asks the user to choose a device. Null if they cancel.
export async function pick(): Promise<HIDDevice | null> {
  const [d] = await navigator.hid.requestDevice({ filters: [{ usagePage: RawUsagePage }] });
  return d ?? null;
}

// known lists the devices the user has allowed this site before.
export async function known(): Promise<HIDDevice[]> {
  return (await navigator.hid.getDevices()).filter(isChannel);
}

export class HIDTransport implements Transport {
  onReport: ((report: Uint8Array) => void) | null = null;

  private constructor(readonly device: HIDDevice) {
    device.addEventListener("inputreport", this.input);
  }

  static async open(device: HIDDevice): Promise<HIDTransport> {
    if (!device.opened) await device.open();
    return new HIDTransport(device);
  }

  private input = (e: HIDInputReportEvent) => {
    this.onReport?.(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength));
  };

  // No report IDs, so report 0.
  send(report: Uint8Array) {
    return this.device.sendReport(0, report as BufferSource);
  }

  async close() {
    this.device.removeEventListener("inputreport", this.input);
    if (this.device.opened) await this.device.close();
  }
}
