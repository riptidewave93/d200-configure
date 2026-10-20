<!-- The connected device: what it runs, its settings and its own web pages. -->
<script lang="ts">
  import { app } from "../lib/context";
  import { onDestroy } from "svelte";
  import { canAlign, nudge, offsetWords } from "../lib/align";
  import { message } from "../lib/device.svelte";
  import { hasCommand } from "../lib/features";

  // onreset: the device was erased and is restarting
  let { onreset }: { onreset?: () => void } = $props();
  const { device, doc } = app();
  const installURL = "https://github.com/riptidewave93/d200-deck/blob/main/docs/install.md";

  let error = $state("");
  let address = $state(device.settings?.usb_net4 ?? "");
  let addressOK = $derived(address === "" || /^(\d{1,3})(\.\d{1,3}){3}$/.test(address));
  // the slider's own value: replies to earlier changes come in while it moves
  let brightness = $state(device.settings?.brightness ?? 100);
  let usb = $derived(device.settings?.usb_drive !== undefined || device.settings?.usb_net4 !== undefined);

  async function setBrightness(v: number) {
    brightness = v;
    error = "";
    try {
      await device.setBrightness(v);
    } catch (err) {
      error = message(err);
    }
  }

  async function change(s: Parameters<typeof device.changeSettings>[0]) {
    error = "";
    try {
      await device.changeSettings(s);
    } catch (err) {
      error = message(err);
    }
  }

  // Align screen: the device shows a pattern while the picture is moved
  let aligning = $state(false);
  let offset = $state({ x: 0, y: 0 });
  async function align(on: boolean) {
    error = "";
    try {
      if (on) offset = device.settings?.screen_offset ?? { x: 0, y: 0 };
      aligning = on;
      await device.showPattern(on);
    } catch (err) {
      error = message(err);
    }
  }
  async function move(to: { x: number; y: number }) {
    offset = to;
    error = "";
    try {
      await device.setOffset(to);
    } catch (err) {
      error = message(err);
    }
  }
  const step = (dx: number, dy: number) => nudge(offset, dx, dy, device.settings);
  const same = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y;
  const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  function arrowKey(e: KeyboardEvent) {
    const d = arrows[e.key];
    if (!aligning || !d || (e.target as HTMLElement).closest?.("input, select, textarea")) return;
    e.preventDefault();
    move(step(...d));
  }
  // closing the panel ends the pattern
  onDestroy(() => {
    if (aligning) device.showPattern(false).catch(() => {});
  });

  // Reset device: erases its keys and settings, asked on the device too
  let canReset = $derived(hasCommand(device.hello?.features, "reset"));
  async function reset() {
    const lost = doc.dirty ? "\n\nYour unsaved changes here are lost too. Save a file first to keep them." : "";
    const ok = confirm(
      "Erase everything on the device?\n\n" +
        "Its keys and all its settings go: brightness, sleep screen, screen alignment, the USB drive and network, " +
        "and which computer it's used with. Its software stays.\n\n" +
        "The device then restarts, which takes about half a minute." +
        lost,
    );
    if (!ok) return;
    error = "";
    try {
      await device.reset();
      doc.close();
      onreset?.();
    } catch (err) {
      error = message(err);
    }
  }

  let flashed = $state(false);
  async function flash() {
    error = "";
    try {
      await device.flash();
      flashed = true;
      setTimeout(() => (flashed = false), 1500);
    } catch (err) {
      error = message(err);
    }
  }

  let h = $derived(device.hello);
  // a commit hash is shown short; copying it copies the whole
  let software = $derived(h?.firmware ?? "");
  let softwareShort = $derived(/^[0-9a-f]{12,}$/.test(software) ? software.slice(0, 7) : software);
  function copySoftware(e: ClipboardEvent) {
    e.clipboardData?.setData("text/plain", software);
    e.preventDefault();
  }
  let host = $derived(device.host);
</script>

<svelte:window onkeydown={arrowKey} />

<div>
  <div class="row head">
    <h2>Device</h2>
    <span class="grow"></span>
    <button class="plain" onclick={flash} disabled={flashed}>{flashed ? "Flashed" : "Flash to identify"}</button>
  </div>
  <dl>
    <dt>Software</dt>
    <dd>
      <span title={software} oncopy={copySoftware}>{softwareShort}</span>
      {#if device.pageURL("/update")}<a class="update" href={device.pageURL("/update")} target="_blank" rel="noreferrer"
          >Update…</a
        >{/if}
    </dd>
    {#if h?.os.version}<dt>System</dt>
      <dd>{h.os.version}{h.os.flavour ? ` (${h.os.flavour})` : ""}</dd>{/if}
    <dt>PC helper</dt>
    <dd>
      {#if host?.connected}
        Running{host.version ? `, ${host.version}` : ""}
      {:else}
        Not running. <a href={installURL} target="_blank" rel="noreferrer">Install it</a> for keys that open websites,
        programs or apps.
      {/if}
    </dd>
  </dl>

  {#if device.settings}
    {#if device.settings.brightness !== undefined}
      <label>
        <span>Brightness</span>
        <input
          type="range"
          min={device.settings.brightness_min ?? 0}
          max="100"
          value={brightness}
          oninput={(e) => setBrightness(e.currentTarget.valueAsNumber)}
        />
      </label>
    {/if}
    {#if device.settings.sleep_screen !== undefined}
      <label>
        <span>Screen while the computer sleeps</span>
        <select
          value={device.settings.sleep_screen}
          onchange={(e) => change({ sleep_screen: e.currentTarget.value as "zzz" | "off" })}
        >
          <option value="zzz">Dimmed, with zzZ</option>
          <option value="off">Off</option>
        </select>
      </label>
    {/if}
    {#if canAlign(device.hello, device.settings)}
      {#if !aligning}
        <button class="plain align-open" onclick={() => align(true)}>Align screen</button>
      {:else}
        <section class="align" aria-label="Align screen">
          <h3>Align screen</h3>
          <p class="small">Move the picture until each white frame sits inside its key.</p>
          <div class="pad">
            {#each [["up", "↑", 0, -1], ["left", "←", -1, 0], ["right", "→", 1, 0], ["down", "↓", 0, 1]] as const as [name, arrow, dx, dy] (name)}
              <button
                class="quiet {name}"
                aria-label="Move {name}"
                disabled={same(step(dx, dy), offset)}
                onclick={() => move(step(dx, dy))}>{arrow}</button
              >
            {/each}
          </div>
          <p class="muted small where" role="status">{offsetWords(offset)}</p>
          <div class="row">
            <button class="plain" disabled={same(offset, { x: 0, y: 0 })} onclick={() => move({ x: 0, y: 0 })}
              >Reset to default</button
            >
            <span class="grow"></span>
            <button onclick={() => align(false)}>Done</button>
          </div>
        </section>
      {/if}
    {/if}
    {#if device.settings.usb_drive !== undefined}
      <label class="row check">
        <input
          type="checkbox"
          checked={device.settings.usb_drive}
          onchange={(e) => change({ usb_drive: e.currentTarget.checked })}
        />
        USB drive with a README
      </label>
    {/if}
    {#if device.settings.usb_net4 !== undefined}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          change({ usb_net4: address });
        }}
      >
        <label>
          <span>USB network address, if the default clashes with another network</span>
          <div class="row">
            <input class="grow" bind:value={address} placeholder="e.g. 10.77.0.4" />
            <button disabled={!addressOK || address === (device.settings.usb_net4 ?? "")}>Change</button>
          </div>
        </label>
        {#if !addressOK}<p class="bad">An IPv4 address, such as 10.77.0.4.</p>{/if}
      </form>
    {/if}
    {#if usb}<p class="muted">Changing the USB settings reconnects the device.</p>{/if}
  {/if}
  {#if error}<p class="bad">{error}</p>{/if}

  {#if device.pageURL("/")}
    <p class="small debug"><a href={device.pageURL("/debug")} target="_blank" rel="noreferrer">Debug info</a></p>
  {/if}

  {#if canReset}
    <div class="reset">
      {#if device.asking === "Erase"}
        <p class="small" role="status">Press <strong>Erase</strong> on the device to confirm.</p>
      {:else}
        <button class="plain danger" onclick={reset}>Reset device…</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .head {
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
  }
  dl {
    font-size: 14px;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 4px 16px;
    margin: 0 0 16px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .check {
    flex-wrap: nowrap;
  }
  .update {
    margin-left: 10px;
  }
  .debug {
    margin: 12px 0 0;
  }
  .reset {
    border-top: 1px solid var(--line);
    margin-top: 12px;
    padding-top: 8px;
  }
  .reset p {
    margin: 4px 0;
  }
  .danger {
    color: var(--bad);
    margin-left: -6px;
  }
  .align-open {
    display: flex;
    margin: 0 0 12px -6px;
  }
  .align {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px;
    margin: 0 0 12px;
  }
  .align h3 {
    margin: 0 0 4px;
    font-size: 14px;
  }
  .align p {
    margin: 0 0 8px;
  }
  .pad {
    display: grid;
    grid-template-columns: repeat(3, 40px);
    grid-template-rows: repeat(3, 40px);
    gap: 4px;
    grid-template-areas: ". up ." "left . right" ". down .";
    justify-content: center;
    margin: 4px 0 8px;
  }
  .pad button {
    display: grid;
    place-items: center;
    font-size: 18px;
    padding: 0;
    color: var(--fg);
    background: var(--field);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .pad button:disabled {
    color: var(--muted);
  }
  .pad .up {
    grid-area: up;
  }
  .pad .down {
    grid-area: down;
  }
  .pad .left {
    grid-area: left;
  }
  .pad .right {
    grid-area: right;
  }
  .where {
    text-align: center;
  }
</style>
