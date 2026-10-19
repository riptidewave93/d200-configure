# Everything runs in containers (Node, and Go for the WebAssembly part), so any host with Docker
# (and CI) builds the same way.
# DOCKER= uses the host's Node and Go instead: make test DOCKER=
NODE_IMAGE ?= node:24.22.0-bookworm-slim
GO_IMAGE ?= golang:1.27.0-bookworm
DOCKER ?= docker
# d200-deck's source: the WebAssembly part is built from its Go packages. Locally, a
# checkout next to this one; in CI, DECK_VERSION fetched by make deck-source.
DECK_DIR ?= ../d200-deck
DECK_REPO := https://github.com/riptidewave93/d200-deck.git
DECK_VERSION := 46a213b43f178d9f520913d908c10287e59df8ee

REPO_DIR := $(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))
COMMA := ,
ifneq ($(DOCKER),)
RUN := $(DOCKER) run --rm --user $(shell id -u):$(shell id -g) -e HOME=/tmp \
	-e npm_config_cache=/repo/.cache/npm -e npm_config_update_notifier=false \
	-v "$(REPO_DIR)":/repo:Z -w /repo
endif

.PHONY: all check test build dev wasm deck-source clean

all : check test build

node_modules : package.json package-lock.json
	$(RUN) $(NODE_IMAGE) npm ci --no-audit --no-fund
	touch $@

# d200-deck's config and drawing code as WebAssembly, and the Go fonts the page uses, into src/wasm
wasm :
	mkdir -p src/wasm .cache
	printf 'go 1.27\n\nuse (\n\t../wasm\n\t%s\n)\n' $(if $(DOCKER),/deck,$(abspath $(DECK_DIR))) > .cache/go.work
	$(RUN) $(if $(DOCKER),-v "$(abspath $(DECK_DIR))":/deck:ro$(COMMA)z -e GOCACHE=/repo/.cache/go-build \
		-e GOMODCACHE=/repo/.cache/mod $(GO_IMAGE)) env GOWORK=$(if $(DOCKER),/repo,$(REPO_DIR))/.cache/go.work \
		GOOS=js GOARCH=wasm GOFLAGS=-buildvcs=false sh -c 'go build -C wasm -trimpath -ldflags "-s -w" \
		-o ../src/wasm/deck.wasm . && cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" src/wasm/ && \
		fonts="$$(go list -C wasm -m -f "{{.Dir}}" golang.org/x/image)/font/gofont/ttfs" && \
		install -m 644 "$$fonts/Go-Regular.ttf" "$$fonts/Go-Medium.ttf" src/wasm/'

# d200-deck at DECK_VERSION into .cache/d200-deck, for CI: make deck-source && make DECK_DIR=.cache/d200-deck
deck-source :
	rm -rf .cache/d200-deck && git init -q .cache/d200-deck
	git -C .cache/d200-deck fetch -q --depth 1 $(DECK_REPO) $(DECK_VERSION)
	git -C .cache/d200-deck checkout -q FETCH_HEAD

# Type checks (TypeScript and Svelte)
check : node_modules wasm
	$(RUN) $(NODE_IMAGE) npx svelte-check --fail-on-warnings

# Unit tests
test : node_modules wasm
	$(RUN) $(NODE_IMAGE) npx vitest run

# The site, into ./dist
build : node_modules wasm
	$(RUN) $(NODE_IMAGE) npx vite build

# Dev server at http://localhost:5173/d200-configure/ (WebHID works on localhost)
dev : node_modules wasm
	$(RUN) $(if $(DOCKER),-it -p 127.0.0.1:5173:5173) $(NODE_IMAGE) npx vite --host 0.0.0.0

clean :
	rm -rf ./dist ./node_modules ./.cache
