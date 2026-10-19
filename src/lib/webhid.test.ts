import { describe, expect, it } from "vitest";
import { browserWarning } from "./webhid";

const nav = (hid: boolean, ...brands: string[]) =>
  ({ ...(hid ? { hid: {} } : {}), userAgentData: { brands: brands.map((brand) => ({ brand })) } }) as never;

describe("browserWarning", () => {
  it("says nothing in Chrome and Edge", () => {
    expect(browserWarning(nav(true, "Chromium", "Google Chrome"))).toBe("");
    expect(browserWarning(nav(true, "Chromium", "Microsoft Edge"))).toBe("");
  });

  it("warns without WebHID", () => {
    expect(browserWarning({} as never)).toMatch(/can't connect/);
  });

  it("warns in other browsers with WebHID", () => {
    expect(browserWarning(nav(true, "Chromium", "Opera"))).toMatch(/made for Chrome and Edge/);
  });
});
