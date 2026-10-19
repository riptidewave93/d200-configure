<!-- The connected device: what it runs, its settings and its own web pages. -->
<script lang="ts">
  import { app } from "../lib/context";
  import { message } from "../lib/device.svelte";

  const { device } = app();
  const installURL = "https://github.com/riptidewave93/d200-deck/blob/main/docs/install.md";

  let error = $state("");
  let address = $state(device.settings?.usb_net4 ?? "");
  let addressOK = $derived(address === "" || /^(\d{1,3})(\.\d{1,3}){3}$/.test(address));

  async function change(s: Parameters<typeof device.changeSettings>[0]) {
    error = "";
    try {
      await device.changeSettings(s);
    } catch (err) {
      error = message(err);
    }
  }

  let h = $derived(device.hello);
  let host = $derived(device.host);
</script>

<div class="card">
  <h2>Device</h2>
  <dl>
    <dt>Software</dt>
    <dd>{h?.firmware}</dd>
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
            <input class="grow" bind:value={address} placeholder="Default" />
            <button disabled={!addressOK || address === (device.settings.usb_net4 ?? "")}>Change</button>
          </div>
        </label>
        {#if !addressOK}<p class="bad">An IPv4 address, such as 10.77.0.4.</p>{/if}
      </form>
    {/if}
    <p class="muted">Changing these reconnects the device.</p>
  {/if}
  {#if error}<p class="bad">{error}</p>{/if}

  {#if device.pageURL("/")}
    <div class="row links">
      <a class="button" href={device.pageURL("/update")} target="_blank" rel="noreferrer">Update</a>
      <a href={device.pageURL("/debug")} target="_blank" rel="noreferrer">Debug info</a>
    </div>
  {/if}
</div>

<style>
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 16px;
    margin: 0 0 16px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .check {
    flex-wrap: nowrap;
  }
  .links {
    margin-top: 12px;
    gap: 16px;
  }
</style>
