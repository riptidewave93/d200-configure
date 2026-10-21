// Writes src/lib/logos.json, the icon picker's app logos, each with its
// brand colour and its path redrawn without arcs (the device can't draw
// them). Run by hand with `make logos` after changing a source below; the
// output is kept in git. It stops on a logo whose licence can't ship with
// the site, or that NOTICE.md doesn't credit, and copies the licences that
// must ship with the logos into public/licenses/.

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

// logos from other icon sets, with their brands' own colours
const ph = (f) => ({ pkg: "@phosphor-icons/core", file: `assets/fill/${f}-logo-fill.svg` });
const bs = (f) => ({ pkg: "bootstrap-icons", file: `icons/${f}.svg` });
const others = [
  { ...ph("microsoft-word"), name: "microsoft-word", title: "Word", hex: "#2B579A", group: "Work" },
  { ...ph("microsoft-excel"), name: "microsoft-excel", title: "Excel", hex: "#217346", group: "Work" },
  { ...ph("microsoft-powerpoint"), name: "microsoft-powerpoint", title: "PowerPoint", hex: "#B7472A", group: "Work" },
  { ...ph("microsoft-outlook"), name: "microsoft-outlook", title: "Outlook", hex: "#0078D4", group: "Work" },
  { ...ph("microsoft-teams"), name: "microsoft-teams", title: "Teams", hex: "#6264A7", group: "Chat" },
  { ...bs("windows"), name: "windows-logo", title: "Windows", hex: "#0078D4", group: "System" },
  { ...bs("browser-edge"), name: "microsoft-edge", title: "Edge", hex: "#0078D7", group: "Browsers" },
  { ...bs("xbox"), name: "xbox", title: "Xbox", hex: "#107C10", group: "Games" },
  { ...bs("slack"), name: "slack", title: "Slack", hex: "#4A154B", group: "Chat" },
  { ...bs("openai"), name: "openai", title: "OpenAI", hex: "#000000", group: "Work" },
  { pkg: "@vscode/codicons", file: "src/icons/vscode.svg", name: "vscode", title: "VS Code", hex: "#007ACC", group: "Code" },
];

// converted by hand once from Tabler's outlines, with the tool and steps
// the file records
const adobe = JSON.parse(fs.readFileSync("scripts/logos/adobe-filled.json", "utf8"));
const adobeColours = {
  "adobe-photoshop": "#31A8FF",
  "adobe-premiere": "#9999FF",
  "adobe-illustrator": "#FF9A00",
  "adobe-after-effects": "#9999FF",
};

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

// the others: their paths joined, filled nonzero as the device does
for (const o of others) {
  const svg = fs.readFileSync(`node_modules/${o.pkg}/${o.file}`, "utf8");
  const licence = JSON.parse(fs.readFileSync(`node_modules/${o.pkg}/package.json`, "utf8")).license;
  if (!licences.has(licence)) fail(`${o.name}: licence ${licence}`);
  if (!notice.includes(`\`${o.name}\``)) fail(`${o.name}: credit it in NOTICE.md`);
  if (/<(?!svg|path|\/)|stroke|fill-rule|transform/.test(svg)) fail(`${o.name}: want filled paths only`);
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? fail(`${o.name}: no viewBox`);
  const d = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => noArcs(m[1])).join("");
  // Phosphor's 256 has a margin; the 16s don't, so they get one like Simple Icons'
  const box = viewBox === "0 0 16 16" ? "-1.333 -1.333 18.667 18.667" : viewBox;
  out.push({ name: o.name, title: o.title, hex: o.hex, group: o.group, d, viewBox: box });
}

for (const a of adobe.icons) {
  if (!notice.includes(`\`${a.name}\``)) fail(`${a.name}: credit it in NOTICE.md`);
  const hex = adobeColours[a.name] ?? fail(`${a.name}: no colour`);
  out.push({ name: a.name, title: a.title, hex, group: "Creative", d: noArcs(a.path), viewBox: a.viewBox });
}

const pkgs = ["simple-icons", ...new Set(others.map((o) => o.pkg))];
const sources = [...pkgs.map((p) => `${p} ${version(p)}`), "scripts/logos/adobe-filled.json"];
out.sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }));
fs.writeFileSync("src/lib/logos.json", JSON.stringify({ sources, logos: out }, null, 1) + "\n");

// the licences that ask to ship with the logos
fs.mkdirSync("public/licenses", { recursive: true });
for (const p of pkgs.slice(1)) fs.copyFileSync(`node_modules/${p}/LICENSE`, `public/licenses/${p.replace(/^@/, "").replace("/", "-")}.txt`);
fs.copyFileSync("scripts/logos/adobe-tabler-LICENSE.txt", "public/licenses/tabler-icons.txt");
console.log(`src/lib/logos.json: ${out.length} logos from ${sources.join(", ")}`);
