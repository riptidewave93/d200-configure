# Everything runs in containers (Node, and TinyGo for the WebAssembly part), so any host with
# Docker (and CI) builds the same way.
# DOCKER= uses the host's Node, Go and TinyGo instead: make test DOCKER=
NODE_IMAGE ?= node:24.22.0-bookworm-slim
GO_IMAGE ?= golang:1.27.0-bookworm
# TinyGo makes the WebAssembly part about a third smaller than Go does
TINYGO_IMAGE ?= tinygo/tinygo:0.43.0
DOCKER ?= docker
# d200-deck's source: the WebAssembly part is built from its Go packages. Locally, a
# checkout next to this one; in CI, DECK_VERSION fetched by make deck-source.
DECK_DIR ?= ../d200-deck
DECK_REPO := https://github.com/riptidewave93/d200-deck.git
DECK_VERSION := v0.3.2

REPO_DIR := $(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))
COMMA := ,
ifneq ($(DOCKER),)
RUN := $(DOCKER) run --rm --user $(shell id -u):$(shell id -g) -e HOME=/tmp \
	-e npm_config_cache=/repo/.cache/npm -e npm_config_update_notifier=false \
	-v "$(REPO_DIR)":/repo:Z -w /repo
endif

.PHONY: all check test build dev wasm icons logos fonts deck-source clean

all : check test build

node_modules : package.json package-lock.json
	$(RUN) $(NODE_IMAGE) npm ci --no-audit --no-fund
	touch $@

# Go and TinyGo, with d200-deck's source as part of a workspace (written by GOWORK_FILE)
GO_RUN = $(RUN) $(if $(DOCKER),-v "$(abspath $(DECK_DIR))":/deck:ro$(COMMA)z -e GOCACHE=/repo/.cache/go-build \
	-e GOMODCACHE=/repo/.cache/mod $(1)) env GOWORK=$(if $(DOCKER),/repo,$(REPO_DIR))/.cache/go.work GOFLAGS=-buildvcs=false
GO := $(call GO_RUN,$(GO_IMAGE))
# TinyGo can't run Go's newer JSON code yet (it lacks reflect.SliceOf), so it builds the older one
TINYGO := $(call GO_RUN,$(TINYGO_IMAGE)) GOEXPERIMENT=nojsonv2
GOWORK_FILE = mkdir -p .cache && printf 'go 1.27\n\nuse (\n\t../wasm\n\t%s\n)\n' $(if $(DOCKER),/deck,$(abspath $(DECK_DIR))) > .cache/go.work

# d200-deck's config and drawing code as WebAssembly, and the Go fonts the page uses, into src/wasm
wasm :
	mkdir -p src/wasm
	$(GOWORK_FILE)
	$(TINYGO) sh -c 'cd wasm && tinygo build -target wasm -no-debug -opt=z -o ../src/wasm/deck.wasm . && \
		cd .. && cp "$$(tinygo env TINYGOROOT)/targets/wasm_exec.js" src/wasm/ && \
		fonts="$$(go list -C wasm -m -f "{{.Dir}}" golang.org/x/image)/font/gofont/ttfs" && \
		install -m 644 "$$fonts/Go-Regular.ttf" "$$fonts/Go-Medium.ttf" src/wasm/'

# The icon catalog (src/lib/icons.json), from d200-deck's icons package at DECK_DIR; kept in git
icons :
	$(GOWORK_FILE)
	$(GO) go run -C wasm ./genicons "$$(git -C $(DECK_DIR) describe --tags --always)" > src/lib/icons.json

# The icon picker's app logos (src/lib/logos.json), from the icon packages in package.json; kept in git
logos : node_modules
	$(RUN) $(NODE_IMAGE) node scripts/logos.mjs

# The font catalog (src/lib/fontcatalog.json) into public/fonts, from Google Fonts; kept in git
fonts :
	$(RUN) $(NODE_IMAGE) node scripts/fonts.mjs

# d200-deck at DECK_VERSION into .cache/d200-deck, for CI: make deck-source && make DECK_DIR=.cache/d200-deck
deck-source :
	rm -rf .cache/d200-deck && git init -q .cache/d200-deck
	git -C .cache/d200-deck fetch -q --depth 1 $(DECK_REPO) $(DECK_VERSION)
	git -C .cache/d200-deck checkout -q FETCH_HEAD

# Type checks (TypeScript and Svelte)
check : node_modules wasm
	$(RUN) $(NODE_IMAGE) npx svelte-check --fail-on-warnings

# Unit tests: the site's, then the Go ones (picture fitting). The site's check its "Open app" list
# against d200-deck's docs.
test : node_modules wasm
	$(RUN) $(if $(DOCKER),-v "$(abspath $(DECK_DIR))":/deck:ro$(COMMA)z) $(NODE_IMAGE) \
		env DECK_DIR=$(if $(DOCKER),/deck,$(abspath $(DECK_DIR))) npx vitest run
	$(GO) go test -C wasm ./fit/

# The site, into ./dist
build : node_modules wasm
	$(RUN) $(NODE_IMAGE) npx vite build

# Dev server at http://localhost:5173/d200-configure/ (WebHID works on localhost). -it only from a
# terminal, so it also runs from scripts.
dev : node_modules wasm
	$(RUN) $(if $(DOCKER),$(shell [ -t 0 ] && echo -it) --init -p 127.0.0.1:5173:5173) $(NODE_IMAGE) npx vite --host 0.0.0.0

clean :
	rm -rf ./dist ./node_modules ./.cache
