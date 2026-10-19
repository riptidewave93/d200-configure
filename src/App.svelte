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
  import { browserWarning, supported } from "./lib/webhid";

  const device = new Device();
  const doc = new Doc();
  let deck = $state<Deck | null>(null);
  setApp({ doc, device, deck: () => deck });

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
      error = `Can't save: ${why}.`;
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
      notice = "Saved.";
    } catch (err) {
      error = message(err);
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
      error = `That file isn't a valid config: ${why}.`;
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
</script>

<header class="top">
  <strong class="grow">Device Setup</strong>
  {#if device.state === "connecting"}<span class="muted">Connecting…</span>{/if}
  {#if device.state === "reconnecting"}<span class="muted">Reconnecting…</span>{/if}
  {#if connected}
    <button class="plain" onclick={() => (showDevice = !showDevice)}>Device</button>
    <button class="plain" onclick={() => device.disconnect()}>Disconnect</button>
  {:else if supported() && doc.config}
    <button onclick={() => device.choose()}>Connect</button>
  {/if}
</header>

<main>
  {#if warning}<p class="warn">{warning}</p>{/if}
  {#if device.error}<p class="bad">{device.error}</p>{/if}
  {#if error}<p class="bad">{error}</p>{/if}

  {#if device.progress}
    <p class="muted">{working}…</p>
    <progress max={device.progress.total || 1} value={device.progress.done}></progress>
  {/if}

  {#if conflict}
    <div class="warn row">
      <span class="grow">The device's config changed since it was read here.</span>
      <button onclick={() => save(true)}>Replace it</button>
      <button class="plain" onclick={loadFromDevice}>Load the device's</button>
    </div>
  {:else if device.changed}
    <div class="warn row">
      <span class="grow"
        >The device has a different config{doc.dirty ? ". Loading it drops your changes." : "."}</span
      >
      <button onclick={loadFromDevice}>Load it</button>
    </div>
  {/if}

  {#if showDevice && connected}<DevicePanel />{/if}

  {#if !doc.config}
    <div class="card start">
      <h2>Set up your device's keys</h2>
      {#if supported()}
        <p>Plug the device into this PC, then connect to it.</p>
        <div class="row">
          <button onclick={() => device.choose()} disabled={device.state !== "none"}>Connect a device</button>
          <button class="plain" onclick={() => fileInput.click()}>Or open a config file</button>
        </div>
        {#if linux}
          <p class="muted note">
            On Linux the browser needs a <a href={ruleURL} target="_blank" rel="noreferrer">udev rule</a> to open the
            device. The PC helper installs it.
          </p>
        {/if}
      {:else}
        <button onclick={() => fileInput.click()}>Open a config file</button>
      {/if}
    </div>
  {:else}
    <div class="row toolbar">
      {#if connected}
        <button onclick={() => save()} disabled={!doc.dirty || !!working}>Save to device</button>
      {/if}
      {#if doc.dirty && doc.saved}<button class="plain" onclick={() => doc.revert()}>Undo changes</button>{/if}
      {#if notice}<span class="muted">{notice}</span>{/if}
      <span class="grow"></span>
      <button class="plain" onclick={() => fileInput.click()}>Open file</button>
      <button class="plain" onclick={saveFile}>Save file</button>
    </div>

    <PageBar {doc} />
    <div class="editor">
      <div class="face">
        {#if deck}<Face {doc} layout={deck.layout} />{:else}<p class="muted">Loading…</p>{/if}
      </div>
      <div class="side">
        {#if doc.key !== null}
          {#key `${doc.page}/${doc.key}`}<KeyEditor key={doc.key} />{/key}
        {:else}
          <p class="muted">Pick a key to change it{connected ? ", or press it on the device" : ""}.</p>
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
    padding: 10px 20px;
    border-bottom: 1px solid var(--line);
    background: var(--card);
  }
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .start {
    width: 100%;
    max-width: 520px;
    margin: 40px auto;
  }
  .note {
    margin-top: 16px;
    font-size: 14px;
  }
  .editor {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .face {
    flex: 3 1 480px;
  }
  .side {
    flex: 2 1 320px;
  }
  progress {
    width: 100%;
  }
</style>
