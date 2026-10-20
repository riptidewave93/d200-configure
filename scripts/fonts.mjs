// Downloads the font catalog (src/lib/fontcatalog.json) into public/fonts:
// each font as a TrueType file from Google Fonts, one weight per file, and
// each family's license. Run by `make fonts`; the files are kept in git.

import fs from "node:fs/promises";

const catalog = JSON.parse(await fs.readFile("src/lib/fontcatalog.json", "utf8"));
await fs.mkdir("public/fonts/licenses", { recursive: true });

async function get(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
}

for (const f of catalog) {
  // Google Fonts gives older browsers whole TrueType files, not split by script
  const css = await (
    await get(`https://fonts.googleapis.com/css2?family=${f.family.replaceAll(" ", "+")}:wght@${f.weight}`, {
      "User-Agent": "Wget/1.21",
    })
  ).text();
  const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error(`${f.id}: no TrueType file in ${css}`);
  const ttf = new Uint8Array(await (await get(url)).arrayBuffer());
  await fs.writeFile(`public/fonts/${f.id}.ttf`, ttf);
  console.log(`${f.id}.ttf`, ttf.length);
}

for (const dir of new Set(catalog.map((f) => f.license))) {
  const file = dir.startsWith("apache/") ? "LICENSE.txt" : "OFL.txt";
  const text = await (await get(`https://raw.githubusercontent.com/google/fonts/main/${dir}/${file}`)).text();
  await fs.writeFile(`public/fonts/licenses/${dir.split("/")[1]}.txt`, text);
}
