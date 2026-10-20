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
  to memory.
- **With a device:** `make dev` and Chrome. On Linux, install the udev rule first
  ([README](../README.md#using-it)). `chrome://device-log` shows WebHID errors.

## Updating d200-deck

Locally the site builds against `../d200-deck`; CI builds against `DECK_VERSION` in the `Makefile`.
Push d200-deck first, then set `DECK_VERSION` to its commit. To build as CI does:

```bash
make deck-source && make DECK_DIR=.cache/d200-deck
```

## Publishing

`.github/workflows/pages.yml` runs `make` on every push and pull request, and publishes `dist/` to
GitHub Pages on pushes to `main`.
