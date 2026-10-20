<script lang="ts">
  import { onMount } from "svelte";
  import DevicePanel from "./components/DevicePanel.svelte";
  import Face from "./components/Face.svelte";
  import KeyEditor from "./components/KeyEditor.svelte";
  import Breadcrumb from "./components/Breadcrumb.svelte";
  import PagePanel from "./components/PagePanel.svelte";
  import PageTree from "./components/PageTree.svelte";
  import { MaxConfigBytes, parse, type Config } from "./lib/config";
  import { setApp } from "./lib/context";
  import { load, type Deck } from "./lib/deck";
  import { Device, message } from "./lib/device.svelte";
  import { Doc } from "./lib/doc.svelte";
  import { explain } from "./lib/errors";
  import { forDevice, newer, runnable, unsupportedMessage } from "./lib/features";
  import { fontText, growFonts } from "./lib/fonts";
  import { modelFor } from "./lib/models";
  import { animatedPixels, maxAnimPixels } from "./lib/pictures";
  import { browserWarning, supported } from "./lib/webhid";

  const device = new Device();
  const doc = new Doc();
  let deck = $state<Deck | null>(null);
  let model = $derived(modelFor(device.hello));
  // what the device takes, and of that what to offer
  let takes = $derived(deck ? forDevice(deck.features, device.hello?.features) : null);
  let offered = $derived(takes ? runnable(takes, device.host) : null);
  let newerDevice = $derived(!!deck && newer(deck.features, device.hello?.features));
  setApp({ doc, device, deck: () => deck, model: () => model, features: () => offered });

  let error = $state("");
  let notice = $state("");
  let working = $state(""); // what the progress bar is for
  let conflict = $state(false); // someone else saved since we read
  let showDevice = $state(false);
  let fileInput: HTMLInputElement;

  const ruleURL = "https://github.com/riptidewave93/d200-deck/blob/main/contrib/linux/70-d200-deck.rules";
  const warning = browserWarning();
  // the warning can be put away, and stays away in this browser
  const dismissedKey = "browser-warning-dismissed";
  let showWarning = $state(!!warning && !stored(dismissedKey));
  let fileMenu = $state(false);

  function stored(key: string): boolean {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  function dismissWarning() {
    showWarning = false;
    try {
      localStorage.setItem(dismissedKey, "1");
    } catch {
      // private windows may refuse; it shows again next time
    }
  }

  function escape(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    const typing = !!t.closest("input, select, textarea");
    // Ctrl+C, Ctrl+X, Ctrl+V copy, cut and paste the selected key
    if ((e.ctrlKey || e.metaKey) && !typing && doc.key !== null && !getSelection()?.toString()) {
      const k = e.key.toLowerCase();
      if (k === "c" || k === "x") doc.copyKey(k === "x");
      if (k === "v" && (!doc.button(doc.key) || confirm(`Replace key ${doc.key + 1} with the ${doc.clip?.cut ? "cut" : "copied"} key?`)))
        doc.pasteKey();
      return;
    }
    if (e.key !== "Escape") return;
    showDevice = fileMenu = false;
    if (!typing) doc.key = null;
  }
  // a click outside a menu closes it
  function outside(e: PointerEvent) {
    if (!(e.target as Element).closest(".device-menu, .files-more")) showDevice = fileMenu = false;
  }
  const linux = navigator.userAgent.includes("Linux") && !navigator.userAgent.includes("Android");
  // the device animates GIFs only up to so many frame pixels
  let tooMuchMotion = $derived(!!deck && !!doc.config && animatedPixels(doc.config, deck, doc.page) > maxAnimPixels);

  let connected = $derived(device.state === "ready" || device.state === "busy");
  let status = $derived(
    {
      none: "Not connected",
      connecting: "Connecting…",
      ready: "Connected",
      busy: "Connected",
      reconnecting: "Reconnecting…",
    }[device.state],
  );

  // cantSave shows why the config can't be saved, and selects the key it's about
  function cantSave(why: string) {
    const p = explain(why);
    if (p.page !== undefined && p.key !== undefined && doc.config?.pages[p.page]) {
      doc.openPage(p.page);
      doc.key = p.key;
      error = p.text;
    } else {
      error = `Can't save: ${p.text}`;
    }
  }

  function discard() {
    fileMenu = false;
    if (confirm("Discard your changes?")) doc.revert();
  }

  device.onKey = (e) => {
    if (!e.release && doc.config) doc.key = e.key;
  };

  device.onOpen = async () => {
    try {
      const info = await device.configInfo();
      if (doc.config && info.rev === device.rev) return; // unchanged, e.g. after a re-plug
      if (doc.dirty) {
        device.changed = info;
        return;
      }
      await loadFromDevice();
    } catch (err) {
      error = message(err);
    }
  };

  async function loadFromDevice() {
    error = notice = "";
    conflict = false;
    working = "Reading the config";
    try {
      doc.load(parse(await device.readConfig()));
    } catch (err) {
      error = message(err);
    } finally {
      working = "";
    }
  }

  async function save(force = false) {
    error = notice = "";
    if (deck) {
      const unknown = doc.tidy(deck);
      if (unknown.length) {
        const names = unknown.map((n) => `"${n}"`).join(", ");
        error = `Can't save: no icon called ${names}.`;
        return;
      }
    }
    const lacks = takes && doc.config ? unsupportedMessage(doc.config, takes) : "";
    if (lacks) {
      error = lacks;
      return;
    }
    const json = JSON.stringify(doc.config);
    const why = deck?.validate(json);
    if (why) {
      cantSave(why);
      return;
    }
    working = "Saving";
    try {
      if (!force && (await device.configInfo()).rev !== device.rev) {
        conflict = true;
        return;
      }
      conflict = false;
      await device.saveConfig(new TextEncoder().encode(json), force);
      doc.markSaved();
      notice = "Saved";
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      if (/^page ".*" key \d+: /i.test(why)) cantSave(why);
      else error = message(err);
    } finally {
      working = "";
    }
  }

  async function openFile(f: File) {
    error = notice = "";
    if (f.size > MaxConfigBytes) {
      error = "That file is too big for a config.";
      return;
    }
    let c: Config;
    try {
      c = JSON.parse(await f.text());
    } catch {
      error = "That file isn't a config.";
      return;
    }
    if (typeof c !== "object" || c === null || !("version" in c || "pages" in c)) {
      error = "That file isn't a config.";
      return;
    }
    const why = deck?.validate(c);
    if (why) {
      error = `That file can't be opened. ${explain(why).text}`;
      return;
    }
    // not on the device yet: Undo goes back to what is
    const onDevice = connected ? doc.saved : "";
    doc.load(c);
    doc.saved = onDevice;
  }

  function saveFile() {
    if (deck) doc.tidy(deck); // so the file works on a device as it is
    const blob = new Blob([JSON.stringify(doc.config, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "config.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  onMount(() => {
    load()
      .then((d) => (deck = d))
      .catch((err) => (error = message(err)));
    if (import.meta.env.DEV && new URLSearchParams(location.search).has("fake")) {
      // a device in memory, to work on the site without one: ?fake
      Promise.all([import("./lib/fakedevice"), load()]).then(([{ FakeDevice }, d]) => {
        const fake = new FakeDevice(d.defaultConfig());
        fake.host = { connected: true, name: "deckhost", version: "dev", apps: [{ name: "discord", title: "Discord" }] };
        device.open(fake);
      });
    } else if (supported()) {
      device.reconnect();
    }
    const leave = (e: BeforeUnloadEvent) => {
      if (doc.dirty) e.preventDefault();
    };
    addEventListener("beforeunload", leave);
    return () => removeEventListener("beforeunload", leave);
  });

  // cut-down fonts gain the characters labels gain
  let fontNeeds = $derived(
    Object.keys(doc.config?.fonts ?? {})
      .map((id) => `${id}:${fontText(doc.config!, id)}`)
      .join("|"),
  );
  $effect(() => {
    void fontNeeds;
    if (deck && doc.config) growFonts(deck, doc.config).catch(() => {});
  });

  // notices fade on their own; errors stay until the next action
  $effect(() => {
    if (!notice) return;
    const t = setTimeout(() => (notice = ""), 3000);
    return () => clearTimeout(t);
  });
</script>

<svelte:window onkeydown={escape} onpointerdown={outside} />

<header class="top">
  <h1>Device Setup</h1>
  <span class="grow"></span>
  {#if doc.config}
    <div class="save row">
      {#if device.progress}
        <span class="muted small">{working}…</span>
        <progress max={device.progress.total || 1} value={device.progress.done}></progress>
      {:else if notice}
        <span class="saved" role="status">{notice}</span>
      {:else if doc.dirty}
        <span class="muted small">Unsaved changes</span>
        {#if doc.saved}<button class="quiet discard" onclick={discard}>Discard changes</button>{/if}
      {/if}
      {#if connected}
        <button class:done={notice === "Saved"} onclick={() => save()} disabled={!doc.dirty || !!working}>
          <span class="wide">Save to device</span><span class="narrow">{notice === "Saved" ? "Saved" : "Save"}</span>
        </button>
      {/if}
    </div>
    <div class="files">
      <button class="quiet" onclick={() => fileInput.click()}>Open file</button>
      <button class={connected ? "quiet" : ""} onclick={saveFile}>Save file</button>
    </div>
    <div class="files-more">
      <button class="quiet" onclick={() => (fileMenu = !fileMenu)} aria-expanded={fileMenu} aria-label="File">⋯</button>
      {#if fileMenu}
        <div class="popover menu">
          <button class="quiet" onclick={() => ((fileMenu = false), fileInput.click())}>Open file</button>
          <button class="quiet" onclick={() => ((fileMenu = false), saveFile())}>Save file</button>
          {#if doc.dirty && doc.saved}<button class="quiet" onclick={discard}>Discard changes</button>{/if}
        </div>
      {/if}
    </div>
  {/if}
  <div class="device-menu">
    {#if connected}
      <button
        class="status on"
        aria-label={status}
        onclick={() => (showDevice = !showDevice)}
        aria-expanded={showDevice}
        aria-haspopup="dialog"
      >
        <span class="dot"></span><span class="status-text">{status}</span>
      </button>
    {:else if device.state !== "none"}
      <span class="status"><span class="dot busy"></span><span class="status-text">{status}</span></span>
    {:else if supported() && doc.config}
      <button onclick={() => device.choose()}>Connect</button>
    {:else}
      <span class="status"><span class="dot"></span><span class="status-text">{status}</span></span>
    {/if}
    {#if showDevice && connected}
      <div class="popover device" role="dialog" aria-label="Device">
        <DevicePanel />
        <div class="row">
          <button class="quiet small" onclick={() => device.disconnect()}>Disconnect</button>
          <button class="quiet small" onclick={() => ((showDevice = false), device.choose())}>Use another device</button>
        </div>
      </div>
    {/if}
  </div>
</header>

<main>
  {#if showWarning}
    <p class="warn row line">
      <span class="grow">{warning}</span>
      <button class="quiet small" onclick={dismissWarning} aria-label="Dismiss">✕</button>
    </p>
  {/if}
  {#if device.error && !device.error.includes("Reload the page")}<p class="warn bad-line">{device.error}</p>{/if}
  {#if newerDevice || device.error.includes("Reload the page")}
    <div class="warn row bad-line">
      <span class="grow">This device's software is newer than this site. Reload the page.</span>
      <button onclick={() => location.reload()}>Reload</button>
    </div>
  {/if}
  {#if error}<p class="warn bad-line">{error}</p>{/if}
  {#if device.asking}
    <p class="asking" role="status">Press <strong>{device.asking}</strong> on the device to confirm.</p>
  {/if}
  {#if conflict}
    <div class="warn row">
      <span class="grow">The device's keys changed since you opened them.</span>
      <button onclick={() => save(true)}>Keep mine</button>
      <button class="plain" onclick={loadFromDevice}>Use the device's</button>
    </div>
  {:else if device.changed}
    <div class="warn row">
      <span class="grow">The device's keys changed since you opened them.</span>
      {#if doc.dirty}<button onclick={() => save(true)}>Keep mine</button>{/if}
      <button class={doc.dirty ? "plain" : ""} onclick={loadFromDevice}>Use the device's</button>
    </div>
  {/if}

  {#if !doc.config}
    <section class="start">
      <div class="start-face">
        <Face {model} />
      </div>
      <h2>Set up your device's keys</h2>
      {#if device.progress}
        <p class="muted">{working}…</p>
        <progress max={device.progress.total || 1} value={device.progress.done}></progress>
      {:else if supported()}
        <p class="muted">Plug it into this computer, then connect.</p>
        <div class="row center">
          <button onclick={() => device.choose()} disabled={device.state !== "none"}>Connect a device</button>
          <button class="plain" onclick={() => fileInput.click()}>Open a config file</button>
        </div>
        {#if linux}
          <p class="muted small note">
            On Linux the browser needs a <a href={ruleURL} target="_blank" rel="noreferrer">udev rule</a> to open the
            device. The PC helper installs it.
          </p>
        {/if}
      {:else}
        <div class="row center">
          <button onclick={() => fileInput.click()}>Open a config file</button>
        </div>
      {/if}
    </section>
  {:else}
    <div class="editor">
      <aside class="rail">
        <PageTree {doc} />
      </aside>
      <div class="middle">
        <Breadcrumb {doc} />
        <div class="face">
          {#if deck}<Face {model} {doc} down={device.down} />{/if}
        </div>
        {#if tooMuchMotion}
          <p class="warn small motion">
            The device can't animate this many moving pictures on one page: some will stand still. Use fewer or
            smaller GIFs.
          </p>
        {/if}
        {#if doc.key === null}
          <p class="muted hint">
            {#if Object.keys(doc.config.pages[doc.page]?.keys ?? {}).length}
              Pick a key to change it{connected ? ", or press it on the device" : ""}.<span class="drag">{" "}Drag keys to move them; hold Alt to copy.</span>
            {:else}
              Nothing here yet. Pick a key to set it up.
            {/if}
          </p>
        {/if}
      </div>
      <div class="side">
        {#if doc.key !== null}
          {#key `${doc.page}/${doc.key}`}<KeyEditor key={doc.key} />{/key}
        {:else}
          {#key doc.page}<PagePanel {doc} />{/key}
        {/if}
      </div>
    </div>
  {/if}
</main>

<input
  bind:this={fileInput}
  type="file"
  accept=".json,application/json"
  hidden
  onchange={(e) => {
    const f = e.currentTarget.files?.[0];
    if (f) openFile(f);
    e.currentTarget.value = "";
  }}
/>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 24px;
    border-bottom: 1px solid var(--line);
    min-height: 58px;
  }
  h1 {
    font-size: 16px;
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .save {
    flex-wrap: nowrap;
  }
  .saved {
    color: var(--accent);
    font-weight: 500;
  }
  .narrow {
    display: none;
  }
  .files-more > button {
    min-width: 32px;
    min-height: 32px;
    justify-content: center;
  }
  .files {
    display: flex;
    gap: 2px;
  }
  .files-more {
    display: none;
    position: relative;
  }
  .device-menu {
    position: relative;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font-weight: 400;
    font-size: 14px;
    min-height: 32px;
  }
  .status.on {
    color: var(--fg);
  }
  .status.on:hover {
    border-color: var(--muted);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted);
    opacity: 0.6;
  }
  .status.on .dot {
    background: #3fb950;
    opacity: 1;
  }
  .dot.busy {
    background: var(--accent);
    opacity: 1;
  }
  .popover {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 16px 40px -12px var(--shadow);
    z-index: 10;
  }
  .popover.device {
    width: min(380px, calc(100vw - 32px));
    padding: 18px 20px 14px;
  }
  .popover.menu {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 6px 10px;
  }
  main {
    max-width: 1480px;
    margin: 0 auto;
    padding: 20px 24px 48px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .line {
    flex-wrap: nowrap;
    margin: 0;
    padding: 6px 8px 6px 14px;
  }
  .bad-line {
    border-color: var(--bad);
    margin: 0;
  }
  .asking {
    margin: 0;
    padding: 12px 16px;
    border: 1px solid var(--accent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .start {
    max-width: 560px;
    margin: 32px auto 0;
    text-align: center;
  }
  .start-face {
    margin: 0 auto 32px;
    max-width: 440px;
  }
  .start h2 {
    font-size: 22px;
    margin-bottom: 6px;
  }
  .center {
    justify-content: center;
    margin-top: 16px;
  }
  .note {
    margin-top: 20px;
  }
  /* page tree | device face | key or page panel */
  .editor {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr) 360px;
    gap: 32px;
    align-items: start;
  }
  .rail {
    position: sticky;
    top: 16px;
    padding-right: 16px;
    border-right: 1px solid var(--line);
    max-height: calc(100vh - 32px);
    overflow-y: auto;
  }
  .face {
    margin-top: 12px;
  }
  .hint {
    margin: 18px 0 0;
    text-align: center;
  }
  .motion {
    margin: 14px 0 0;
  }
  progress {
    width: 140px;
    accent-color: var(--accent);
  }
  .start progress {
    width: 100%;
  }
  /* the tree moves into the breadcrumb */
  @media (max-width: 1100px) {
    .editor {
      grid-template-columns: minmax(0, 1fr) 340px;
    }
    .rail {
      display: none;
    }
  }
  /* one column: the face stays in view while the panel scrolls under it */
  @media (max-width: 900px) {
    .editor {
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }
    .middle {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--bg);
      padding-bottom: 8px;
    }
    .face {
      max-width: calc(40vh * 1.65);
      margin: 8px auto 0;
    }
    .hint {
      margin-top: 10px;
    }
  }
  /* phones: a compact header, file actions in the ⋯ menu */
  @media (max-width: 760px) {
    .top,
    main {
      padding-left: 16px;
      padding-right: 16px;
    }
    .top {
      gap: 8px;
    }
    .files,
    .save .muted,
    .saved,
    .discard,
    .wide,
    .drag {
      display: none;
    }
    .files-more {
      display: block;
    }
    .narrow {
      display: inline;
    }
    button.done:disabled {
      opacity: 1;
      background: none;
      color: var(--accent);
    }
  }
</style>
