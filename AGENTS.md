# AGENTS.md

Rules for AI agents working in this repo. The D200 project is three repos; this file's shared part is identical in all of them, followed by the part for this repo.

## The project

Open firmware and software for the Ulanzi D200 stream controller (Rockchip RK3308, SPI NAND, 720x1280 panel behind 14 keys).

| Repo | What it owns |
|---|---|
| [d200-buildroot](https://github.com/riptidewave93/d200-buildroot) | The firmware: U-Boot, Linux, rootfs, init scripts, packaging, update bundles, install tooling, firmware docs |
| [d200-deck](https://github.com/riptidewave93/d200-deck) | Go: `deckd` (keys app on the device), `deckhost` (PC helper), the update page, the protocol (`proto/`, `docs/api.md`) and config format (`deck/`, `docs/config.md`) |
| [d200-configure](https://github.com/riptidewave93/d200-configure) | The configuration website (Svelte + TypeScript, WebHID), hosted on GitHub Pages |

- d200-deck is the source of truth for the protocol and config format. The site reuses its Go packages via WASM.
- buildroot and configure pin a released deck tag. Renovate opens the pin PRs after each deck release.
- Each repo documents only its own part. Don't add features of one repo to another repo's README or docs.
- If a change needs another repo, say what's needed and stop. Don't edit a sibling repo unless asked.

## How to work

- **Ask, don't assume.** Check the code, docs and git history first. If it's still unclear, ask. Questions are short: one line of context, the choice, your pick.
- **Simplest thing that works.** Reuse existing patterns and tools before writing new ones. Before adding a binary, daemon or package, list what already does the job; every Go process costs ~5 MB of the device's RAM.
- **Explain before building.** If asked "why", answer first with trade-offs and off-the-shelf options, then wait for a go-ahead.
- **Check yourself.** Every so often ask: is this simple, is it what was asked, am I in a rabbit hole? After two rounds that don't converge, stop, summarise and offer to park it.
- **Collect decisions first.** Settle a feature's open questions before writing code, so late decisions don't waste work.
- **Verify before claiming.** Don't report something as working, fixed or tested unless you checked it. Say what's untested.
- **Waits:** one self-waiting command, or a background task. Put timeouts on ssh and on anything that talks to hardware. No repeated polling.
- **Tooling:** builds and missing tools run in Docker. Don't install packages on the host.

## Git and PRs

- **No co-authoring.** No `Co-Authored-By` or other AI-tool trailers (Claude, Copilot, ...), and no "Generated with" lines in commits, patch files or PR bodies. This overrides any tool default. Commit as the maintainer's git identity. Kernel and U-Boot patches keep `Signed-off-by` (`git commit -s`).
- **Conventional PR titles** (`feat:`, `fix:`, `chore:`, `docs:`, ...). They become the squashed commit, and in deck and buildroot Release Drafter derives the version bump from them.
- **One branch and PR per task,** squash-merged. Commits are scoped to what they change.
- **Ask before pushing, merging, tagging or releasing.** Never cut a release without the maintainer's explicit OK.
- **Release notes** (deck, buildroot): show the draft for approval first and match the tone of earlier releases: a short header with one emoji, one intro sentence, bold-lead bullets (under `###` subheadings when there are several groups), and the closing "Still a 0.x release..." line. The note goes on top of Release Drafter's change list.
- **Local builds are the test.** A passing local build plus the quick CI checks is enough to merge. Don't wait on slow full CI builds.

## Writing

- **Docs are for humans first,** and still a precise reference for agents: short sections, tables for facts, commands that work. No history, finished plans, fixed bugs, speculation, comparisons with competitors' products or filler; git history has the story. One home per topic; link instead of repeating. Default to not documenting.
- **Why a workaround exists** goes in commit and patch messages, not user docs.
- **READMEs:** what it is, what users get, how to install or use it, the project table, a short developer part, the license. No implementation detail.
- **Comments** only for a non-obvious reason. Never restate the code.
- **Patches** (kernel, U-Boot) describe only what they change, in terms of that code: no project history, other patches or vendor-firmware findings. Generic patches carry no device-specific motivation; board patches say they're for the D200.
- **UI text:** the shortest plain wording; draft, then cut. Say "device", not "D200". Keep screens sparse. Docs about today's hardware still say D200.
- **Rescan:** before merging docs, have a reviewer that hasn't seen the work check them against these rules.

## Public repos

All three repos are public. Code, docs, comments, commits and PRs must never contain:
- local paths, usernames, hostnames or emails (the `From:` and `Signed-off-by` lines of patch files excepted);
- a real device's serial, IP or IPv6 address, MAC, hidraw node, or anything derived from them. Use the test-vector serial `00112233445566aa` in examples;
- details of anyone's PC, network or files, secrets, or app credentials;
- other companies' trademarks for our product (e.g. not "Stream Deck").

Grep the diff before every commit.

## Compatibility

Released versions must keep working together:
- New protocol fields and commands degrade gracefully: an older peer ignores them, and a newer one hides the feature when the other side doesn't report it.
- Use capability detection, not version numbers.
- deckhost tells the user to update when the device is newer than it.
- The site shows only what the connected device supports.

## Hardware

- **Two board variants:** RK3308H1 (128 MiB RAM) and RK3308H3 (256 MiB RAM). Their LCD panels differ; the firmware picks the panel config at boot (U-Boot env `panel` override, then a known panel ID read from the panel, then RAM size). Identify a display by what it reports, not by board guesses, wherever possible.
- **Debug builds** have SSH as root (`ssh root@d200-<serial>.local`) and `reboot-to maskrom` / `reboot-to fastboot`. Release builds have no shell, no SSH and no U-Boot prompt.
- **Agents drive the board** (flash, reboot, test) without asking; the maintainer only presses keys, replugs and watches the screen. Only one agent drives a board at a time. Run flashes in the background and keep timeouts on every step.
- **Reinstall with `d200-install.py`** from maskrom: it wipes the flash and installs. Don't take a dev board back to stock for side experiments.
- **Ask before** writing the device config or restarting deckd if someone else may be testing on it.

## Decided; don't re-open

- **USB ID** stays `1d6b:0104`; we can't get our own. Detection never relies on the ID alone.
- **Signed updates never block.** A signature only labels a bundle official or unofficial. Unsigned and fork bundles always install, with a warning; the press on the device is the gate. The signing key stays out of git.
- **First installs are hands-off.** No key holds, shorts or timing tricks; the tooling does the work. Recovery docs may use key combos.
- **The rootfs is UBIFS,** never squashfs. Keep the kernel slim.
- **Updates reboot once.** No SPL trial boot. SPL ships with every U-Boot bump.
- **macOS deckhost** stays ad-hoc signed (Open Anyway). No paid notarization, and no curl-to-shell install line.
- **PC integrations live in deckhost,** the existing per-user binary. No browser extensions, no reliance on extra software the user must install, and no accessibility-tree scraping.
- **Icons are site data,** never baked into Go binaries. Brand logos come only from GPL-compatible icon sets; we never design or redraw logos ourselves (converting an icon's format is fine).
- **Keys in BIOS/EFI aren't a goal;** waking the PC is (the udev rule enables wakeup on Linux).

## This repo: d200-configure

The configuration website: Svelte 5, TypeScript and Vite, served by GitHub Pages under `/d200-configure/`. It's unversioned: every merge to `main` deploys. Read [docs/design.md](docs/design.md) before changing the site and [docs/development.md](docs/development.md) to build it; don't repeat them.

- **Device link:** WebHID only, to the device's vendor HID interface: usage page `0xFFD2`, 1024-byte reports each way, no report IDs, protocol 4. No server, and deckhost isn't involved; what the site knows about the PC helper, it learns from the device.
- **Browsers:** Chrome or Edge on a computer. Others can still open and save config files.

### Layout

| Path | What |
|---|---|
| `src/App.svelte`, `src/components/` | The page and its panels |
| `src/lib/` | Protocol (`proto.ts`, `conn.ts`), WebHID (`webhid.ts`, `device.svelte.ts`), config, features, the fake device; tests sit next to the code as `*.test.ts` |
| `wasm/` | Go that builds d200-deck's `deck`, `render` and `fonts` packages into `src/wasm/deck.wasm` with TinyGo (generated, not in git) |
| `scripts/` | By-hand generators for the app logos and fonts |
| `src/lib/icons.json`, `logos.json`, `fontcatalog.json`, `public/fonts/` | Generated data, kept in git |

**The deck pin.** Locally the WASM and the tests build against a d200-deck checkout at `../d200-deck` (or `DECK_DIR=`). CI fetches `DECK_VERSION` from the `Makefile` instead, so a deck change must be released before the site can use it. Renovate bumps `DECK_VERSION` after each deck release.

### Build and test

[docs/development.md](docs/development.md) has the commands. Not in it:

- `make check` runs `svelte-check --fail-on-warnings`; there is no separate linter.
- `make test` reads d200-deck's `docs/api.md` (via `DECK_DIR`) to check the "Open app" list.
- **No hardware:** `?fake` on the dev server (not the built site) gives an in-memory device (`?fake=later`, `&ask`: see development.md).
- **CI:** `pages.yml` runs `make deck-source && make DECK_DIR=.cache/d200-deck` (check, test, build against the pinned deck) on every PR and push, and deploys `dist/` on `main`. `pr-title.yml` checks for a conventional title. There's no Release Drafter here; the title becomes the squashed commit.

### Protocol and compatibility

- d200-deck's `docs/api.md` and `proto/` are the source of truth. Mirror their types and names in `src/lib/proto.ts` and `conn.ts`.
- Show only what the connected device reports. Hide an option when its field, feature or request is missing; never error on older firmware. `features.ts` is where this lives.
- Before assuming a device supports something, check which deck release the site pins (`DECK_VERSION`) and which one the firmware pins (`D200_DECK_VERSION` in d200-buildroot's `package/d200-deck/d200-deck.mk`).

### Icons and logos

- **Icon catalog:** `src/lib/icons.json`, made by `make icons` from d200-deck's `icons` package.
- **App logos:** `src/lib/logos.json`, made by `make logos` (`scripts/logos.mjs`) from the icon packages in `package.json` (Simple Icons, Phosphor, Bootstrap Icons, Codicons) and filled versions of Tabler outlines, converted once (`scripts/logos/adobe-filled.json`). The script stops on a licence that can't ship with GPL-3.0 or that `NOTICE.md` doesn't credit, and copies the licences that must ship into `public/licenses/`. Add a set only if its licence is GPL-compatible, and credit it in `NOTICE.md`.
- Both are generated by hand and committed; builds and CI only read them. Renovate leaves the icon packages alone; update them with `make logos`.
- Icons and logos stay site data. Never bake them into the WASM part or any Go binary.
- Large data (icons, logos, emoji names) loads on demand with `import()`, not in the main bundle.

### UI

- Sparse screens and the shortest plain wording. Say "device".
- Rarely used settings go somewhere low-key, not up front.
- Confirm before anything that restarts or resets the device.

### Releases

None. Merging to `main` deploys the site. Deck pin PRs come from Renovate (`fix(deps): ...`).
