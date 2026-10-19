# Development

## What you need

- Docker, `make` and `git`. Node and Go run in containers, the same locally and in CI.
- [d200-deck](https://github.com/riptidewave93/d200-deck) checked out next to this repo, at
  `../d200-deck`. Part of the site is built from its Go code (see [design.md](design.md#the-device-code-in-the-browser)).
  Use `DECK_DIR=<path>` to point elsewhere.

```
Repos/
  d200-configure/   this repo
  d200-deck/        the device software
```

## Commands

| Command | Does |
|---|---|
| `make` | `check`, `test` and `build` |
| `make dev` | Dev server at http://localhost:5173/d200-configure/, reloads on save |
| `make check` | Type checks (TypeScript and Svelte) |
| `make test` | Unit tests |
| `make build` | The site, into `dist/` |
| `make wasm` | Just the WebAssembly part, into `src/wasm/` (the targets above run it) |
| `make clean` | Removes `dist/`, `node_modules/` and `.cache/` |

`make <target> DOCKER=` uses the host's Node and Go instead of Docker.

## Without a device

Open http://localhost:5173/d200-configure/?fake. The site connects to a device kept in memory
(`src/lib/fakedevice.ts`), loaded with the device's default config and a running PC helper. Saves
go to memory and are lost on reload. `?fake` works only on the dev server, not the published site.

## With a device

WebHID works on `localhost`, so `make dev` and Chrome are enough.

- On Linux, install the udev rule first (see the [README](../README.md#using-it)).
- The device needs a `deckd` with the config commands: d200-deck `9f1171e` or later. Images built
  from d200-buildroot get one once its `package/d200-deck` pin is bumped past it.
- In Chrome, `chrome://device-log` shows WebHID errors; the page's console shows the site's.
- `deckhost config get FILE` (in d200-deck) reads the same config over USB, to compare.

## Code

| Path | What |
|---|---|
| `src/App.svelte` | The page: connecting, saving, files |
| `src/components/` | The editor's parts: the device face, page tabs, key editor, action editor, device panel |
| `src/lib/proto.ts` | The USB protocol's framing and constants (d200-deck `proto/raw.go`) |
| `src/lib/conn.ts` | A connection: requests, replies, events, config read and write (`proto/client.go`, `proto/config.go`) |
| `src/lib/webhid.ts` | Opening the device in the browser |
| `src/lib/device.svelte.ts` | The connected device, reconnecting after it re-plugs |
| `src/lib/doc.svelte.ts` | The config being edited: pages, keys, unsaved changes |
| `src/lib/deck.ts` | Loads the WebAssembly part |
| `src/lib/fakedevice.ts` | The in-memory device, for tests and `?fake` |
| `wasm/main.go` | The WebAssembly part: d200-deck's `deck` and `render` packages for the browser |

Tests sit next to the code as `*.test.ts`.

## Updating d200-deck

The site builds against `../d200-deck` locally, and against `DECK_VERSION` in the `Makefile` in CI.
After a d200-deck change the site uses, push d200-deck, then set `DECK_VERSION` to its commit.
To build against that pin locally, as CI does:

```bash
make deck-source && make DECK_DIR=.cache/d200-deck
```

## Publishing

`.github/workflows/pages.yml` runs `make` on every push and pull request, and publishes `dist/` to
GitHub Pages on pushes to `main`. Once, in the repo's **Settings > Pages**, set **Source** to
**GitHub Actions**.
