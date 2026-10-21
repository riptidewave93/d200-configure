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
| `make icons` | Remakes `src/lib/icons.json`, the icon catalog, from `../d200-deck` (`DECK_DIR`) |
| `make logos` | Remakes `src/lib/logos.json`, the app logos, after changing `scripts/logos.mjs` or an icon package |
| `make fonts` | Downloads the font catalog into `public/fonts/`, after changing `src/lib/fontcatalog.json` |
| `make clean` | Removes `dist/`, `node_modules/` and `.cache/` |

`make <target> DOCKER=` uses the host's Node, Go and TinyGo instead.

## Testing

- **Without a device:** open http://localhost:5173/d200-configure/?fake (dev server only). Saves go
  to memory. With `?fake=later` it connects when you choose Connect, e.g. in the middle of an edit;
  with `&ask` it asks on its "screen" for 4 s before a change it would ask about.
- **With a device:** `make dev` and Chrome. On Linux, install the udev rule first
  ([README](../README.md#what-you-need)). `chrome://device-log` shows WebHID errors.

## Updating d200-deck

Locally the site builds against `../d200-deck`; CI builds against `DECK_VERSION` in the `Makefile`,
fetched from GitHub: a d200-deck release tag, or a commit before its first release. It must be on
GitHub before the site's change is. To build as CI does:

```bash
make deck-source && make DECK_DIR=.cache/d200-deck
```

## Contributing

Changes go in as pull requests with a [conventional](https://www.conventionalcommits.org/) title,
such as `feat: start a new config without a device` or `fix(deps): update d200-deck to v0.2.0`; a
check enforces it. They're squash-merged, so the title becomes the commit on `main`, and merging
deploys the site. Renovate opens a PR when d200-deck releases, and one a week for the build tools.

## Publishing

`.github/workflows/pages.yml` runs `make` on every push and pull request, and publishes `dist/` to
GitHub Pages on pushes to `main`.
