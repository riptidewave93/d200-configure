<script lang="ts">
  import { onMount } from "svelte";
  import DevicePanel from "./components/DevicePanel.svelte";
  import Face from "./components/Face.svelte";
  import KeyEditor from "./components/KeyEditor.svelte";
  import PageBar from "./components/PageBar.svelte";
  import { MaxConfigBytes, parse, type Config } from "./lib/config";
  import { setApp } from "./lib/context";
  import { load, type Deck } from "./lib/deck";
  import { Device, message } from "./lib/device.svelte";
  import { Doc } from "./lib/doc.svelte";
  import { modelFor } from "./lib/models";
  import { browserWarning, supported } from "./lib/webhid";

  const device = new Device();
  const doc = new Doc();
  let deck = $state<Deck | null>(null);
  let model = $derived(modelFor(device.hello));
  setApp({ doc, device, deck: () => deck, model: () => model });

  let error = $state("");
  let notice = $state("");
  let working = $state(""); // what the progress bar is for
  let conflict = $state(false); // someone else saved since we read
  let showDevice = $state(false);
  let fileInput: HTMLInputElement;

  const ruleURL = "https://github.com/riptidewave93/d200-deck/blob/main/contrib/linux/70-d200-deck.rules";
  const warning = browserWarning();
  const linux = navigator.userAgent.includes("Linux") && !navigator.userAgent.includes("Android");

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

  // The device counts keys from 0; the page from 1, as people do.
  const readable = (why: string) => why.replace(/\bkey (\d+)/g, (_, n) => `key ${Number(n) + 1}`);

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
    const json = JSON.stringify(doc.config);
    const why = deck?.validate(json);
    if (why) {
      error = `Can't save: ${readable(why)}.`;
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
      error = readable(message(err));
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
    const why = deck?.validate(c);
    if (why) {
      error = `That file isn't a valid config: ${readable(why)}.`;
      return;
    }
    doc.load(c);
    doc.saved = ""; // not on the device yet
  }

  function saveFile() {
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

  // notices fade on their own; errors stay until the next action
  $effect(() => {
    if (!notice) return;
    const t = setTimeout(() => (notice = ""), 3000);
    return () => clearTimeout(t);
  });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (showDevice = false)} />

<header class="top">
  <h1>Device Setup</h1>
  <span class="grow"></span>
  {#if doc.config}
    <button class="quiet" onclick={() => fileInput.click()}>Open file</button>
    <button class="quiet" onclick={saveFile}>Save file</button>
  {/if}
  <div class="device-menu">
    {#if connected}
      <button
        class="status on"
        onclick={() => (showDevice = !showDevice)}
        aria-expanded={showDevice}
        aria-haspopup="dialog"
      >
        <span class="dot"></span>{status}
      </button>
    {:else if device.state !== "none"}
      <span class="status"><span class="dot busy"></span>{status}</span>
    {:else if supported() && doc.config}
      <button onclick={() => device.choose()}>Connect</button>
    {:else}
      <span class="status"><span class="dot"></span>{status}</span>
    {/if}
    {#if showDevice && connected}
      <div class="popover" role="dialog" aria-label="Device">
        <DevicePanel />
        <button class="quiet small" onclick={() => device.disconnect()}>Disconnect</button>
      </div>
    {/if}
  </div>
</header>

<main>
  {#if warning}<p class="warn">{warning}</p>{/if}
  {#if device.error}<p class="warn bad-line">{device.error}</p>{/if}
  {#if error}<p class="warn bad-line">{error}</p>{/if}

  {#if conflict}
    <div class="warn row">
      <span class="grow">The device's config changed since it was read here.</span>
      <button onclick={() => save(true)}>Replace it</button>
      <button class="plain" onclick={loadFromDevice}>Load the device's</button>
    </div>
  {:else if device.changed}
    <div class="warn row">
      <span class="grow">The device has a different config{doc.dirty ? ". Loading it drops your changes." : "."}</span>
      <button onclick={loadFromDevice}>Load it</button>
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
    <div class="toolbar">
      <PageBar {doc} />
      <div class="save row">
        {#if device.progress}
          <span class="muted small">{working}…</span>
          <progress max={device.progress.total || 1} value={device.progress.done}></progress>
        {:else if notice}
          <span class="muted small" role="status">{notice}</span>
        {:else if doc.dirty}
          <span class="muted small">Unsaved changes</span>
          {#if doc.saved}<button class="quiet" onclick={() => doc.revert()}>Undo</button>{/if}
        {/if}
        {#if connected}
          <button onclick={() => save()} disabled={!doc.dirty || !!working}>Save to device</button>
        {/if}
      </div>
    </div>

    <div class="work">
      <div class="face">
        {#if deck}<Face {model} {doc} down={device.down} />{/if}
      </div>
      <div class="side">
        {#if doc.key !== null}
          {#key `${doc.page}/${doc.key}`}<KeyEditor key={doc.key} />{/key}
        {:else}
          <p class="muted hint">Pick a key to change it{connected ? ", or press it on the device" : ""}.</p>
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
    gap: 8px;
    padding: 12px 24px;
    border-bottom: 1px solid var(--line);
  }
  h1 {
    font-size: 16px;
  }
  .device-menu {
    position: relative;
    margin-left: 8px;
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
    width: min(380px, calc(100vw - 32px));
    padding: 18px 20px 10px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 16px 40px -12px var(--shadow);
    z-index: 10;
  }
  main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 20px 24px 48px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .bad-line {
    border-color: var(--bad);
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
  .toolbar {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .save {
    flex-wrap: nowrap;
  }
  .work {
    display: flex;
    gap: 32px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .face {
    flex: 1 1 520px;
    padding: 8px 0 24px;
  }
  .side {
    flex: 0 1 380px;
    min-width: 300px;
  }
  .hint {
    padding: 18px 4px;
  }
  progress {
    width: 160px;
    accent-color: var(--accent);
  }
  .start progress {
    width: 100%;
  }
  @media (max-width: 720px) {
    .top,
    main {
      padding-left: 16px;
      padding-right: 16px;
    }
    .side {
      min-width: 0;
      flex-basis: 100%;
    }
  }
</style>
