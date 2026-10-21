// Writes src/lib/logos.json, the icon picker's app logos, each with its
// brand colour and its path redrawn without arcs (the device can't draw
// them). Run by hand with `make logos` after changing a source below; the
// output is kept in git. It stops on a logo whose licence can't ship with
// the site, or that NOTICE.md doesn't credit.

import fs from "node:fs";
import { noArcs } from "./arcs.mjs";

const fail = (why) => {
  throw new Error(why);
};

// licences that can ship with the site (GPL-3.0-or-later); a Simple Icons
// logo without one of its own is under the project's CC0
const licences = new Set([
  "CC0-1.0", "MIT", "Apache-2.0", "BSD-3-Clause", "MPL-2.0", "Unlicense", "CC-BY-4.0", "CC-BY-SA-4.0",
  "GPL-3.0-only", "GPL-3.0-or-later", "GPL-2.0-or-later",
]);
const notice = fs.readFileSync("NOTICE.md", "utf8");
const version = (pkg) => JSON.parse(fs.readFileSync(`node_modules/${pkg}/package.json`, "utf8")).version;

// Simple Icons, by group
const simple = {
  Browsers: ["googlechrome", "firefoxbrowser", "brave", "opera", "vivaldi"],
  Chat: ["telegram", "whatsapp", "signal"],
  Games: ["steam", "epicgames", "battledotnet", "gogdotcom", "ea", "ubisoft", "riotgames", "roblox", "nvidia"],
  Media: ["spotify", "vlcmediaplayer", "plex", "kodi"],
  Creative: ["elgato", "davinciresolve", "blender", "gimp", "audacity", "figma"],
  Work: ["libreoffice", "notion", "obsidian", "thunderbird", "dropbox", "1password", "bitwarden"],
  Code: ["jetbrains", "docker"],
};
// icon names for slugs that are already another icon's name
const names = { blender: "blender-logo" };

// marks already among the device's icons, by their names there
const marks = [
  { name: "discord", title: "Discord", hex: "#5865F2", group: "Chat" },
  { name: "github", title: "GitHub", hex: "#181717", group: "Code" },
  { name: "obs", title: "OBS Studio", hex: "#302E31", group: "Creative" },
];

const out = [...marks];

// Simple Icons: one path in 0 0 24 24, given a margin like the other icons'
const si = "node_modules/simple-icons";
const data = JSON.parse(fs.readFileSync(`${si}/data/simple-icons.json`, "utf8"));
const bySlug = new Map(data.map((i) => [i.slug, i]));
const svgRE =
  /^<svg role="img" viewBox="0 0 24 24" xmlns="http:\/\/www\.w3\.org\/2000\/svg"><title>[^<]*<\/title><path d="([^"]+)"\/><\/svg>\s*$/;
for (const [group, slugs] of Object.entries(simple)) {
  for (const slug of slugs) {
    const icon = bySlug.get(slug) ?? fail(`${slug}: not in simple-icons`);
    const licence = icon.license?.type ?? "CC0-1.0";
    if (!licences.has(licence)) fail(`${slug}: licence ${licence}`);
    if (licence !== "CC0-1.0" && !notice.includes(`\`${slug}\``)) fail(`${slug}: ${licence}: credit it in NOTICE.md`);
    const m = svgRE.exec(fs.readFileSync(`${si}/icons/${slug}.svg`, "utf8")) ?? fail(`${slug}: want one path`);
    out.push({ name: names[slug] ?? slug, title: icon.title, hex: `#${icon.hex}`, group, d: noArcs(m[1]), viewBox: "-2 -2 28 28" });
  }
}

const sources = [`simple-icons ${version("simple-icons")}`];
out.sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }));
fs.writeFileSync("src/lib/logos.json", JSON.stringify({ sources, logos: out }, null, 1) + "\n");

console.log(`src/lib/logos.json: ${out.length} logos from ${sources.join(", ")}`);
