# Development

## What you need

- Docker, `make` and `git`. Node, Go and TinyGo run in containers.
- [d200-deck](https://github.com/riptidewave93/d200-deck) checked out at `../d200-deck`, or set
  `DECK_DIR=<path>`. The WebAssembly part is built from it.

## Commands

| Command | Does |
|---|---|
| `make` | `check`, `test` and `build` |
| `make dev` | Dev server at http://localhost:5173/d200-configure/ |
| `make check` | Type checks |
| `make test` | Unit tests |
| `make build` | The site, into `dist/` |
| `make fonts` | Downloads the font catalog into `public/fonts/`, after changing `src/lib/fontcatalog.json` |
| `make clean` | Removes `dist/`, `node_modules/` and `.cache/` |

`make <target> DOCKER=` uses the host's Node, Go and TinyGo instead.

## Testing

- **Without a device:** open http://localhost:5173/d200-configure/?fake (dev server only). Saves go
  to memory. With `?fake=later` it connects when you choose Connect, e.g. in the middle of an edit.
- **With a device:** `make dev` and Chrome. On Linux, install the udev rule first
  ([README](../README.md#what-you-need)). `chrome://device-log` shows WebHID errors.

## Updating d200-deck

Locally the site builds against `../d200-deck`; CI builds against `DECK_VERSION` in the `Makefile`,
fetched from GitHub. Set it to the d200-deck commit the site needs, and push d200-deck before this
repo, or CI can't fetch it. To build as CI does:

```bash
make deck-source && make DECK_DIR=.cache/d200-deck
```

## Publishing

`.github/workflows/pages.yml` runs `make` on every push and pull request, and publishes `dist/` to
GitHub Pages on pushes to `main`.
