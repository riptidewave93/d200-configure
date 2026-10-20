<!-- The selected key: a preview, its look, and what it does. -->
<script lang="ts">
  import { actionTypes } from "../lib/actions";
  import { app } from "../lib/context";
  import ActionEditor from "./ActionEditor.svelte";
  import KeyView from "./KeyView.svelte";
  import LookFields from "./LookFields.svelte";

  let { key }: { key: number } = $props();

  const { doc, device, model, features } = app();
  let button = $derived(doc.button(key));
  let win = $derived(model().windows[key]);
  // a look while on, where the device supports one (or the key has one, to remove)
  let hasOn = $derived(button?.action.type === "app" && (!!button.on || (features()?.fields.includes("button.on") ?? true)));
  let clip = $derived(doc.clip);

  function paste() {
    if (button && !confirm(`Replace key ${key + 1} with the ${clip?.cut ? "cut" : "copied"} key?`)) return;
    doc.pasteKey();
  }
  const types = actionTypes.map((a) => a.type);
</script>

<section class="editor" aria-label="Key {key + 1}">
  <header class="row">
    <h2 class="grow">Key {key + 1}</h2>
    {#if device.state === "ready"}
      <button class="quiet small" onclick={() => device.identify(key)}>Flash on device</button>
    {/if}
    {#if button}<button class="quiet small" onclick={() => doc.setButton(key, undefined)}>Clear</button>{/if}
  </header>

  {#if !button}
    <div class="blank">
      <p class="muted">Nothing on this key yet.</p>
      <div class="row">
        <button onclick={() => doc.setButton(key, { action: {} })}>Set up this key</button>
        {#if clip}
          <button class="plain" onclick={paste}
            >Paste key {clip.from.key + 1}{clip.from.page !== doc.page ? ` from ${clip.from.page}` : ""}</button
          >
        {/if}
      </div>
    </div>
  {:else}
    <div class="previews">
      <figure style:aspect-ratio="{win.w} / {win.h}" class:wide={win.w > win.h}>
        <KeyView {key} {button} />
      </figure>
      {#if hasOn}
        <figure style:aspect-ratio="{win.w} / {win.h}" class:wide={win.w > win.h}>
          <KeyView {key} {button} on />
          <figcaption class="muted small">While on</figcaption>
        </figure>
      {/if}
    </div>

    <h3>Look</h3>
    <LookFields look={button} {key} />

    <h3>When pressed</h3>
    <ActionEditor bind:action={button.action} {types} label={null} />

    {#if hasOn}
      <details class="on" open={!!button.on}>
        <summary>Look while on, such as while muted</summary>
        {#if button.on}
          <LookFields look={button.on} {key} />
          <button class="plain" onclick={() => delete button.on}>Use the built-in look</button>
        {:else}
          <button class="plain" onclick={() => (button.on = {})}>Give it its own look</button>
        {/if}
      </details>
    {/if}
  {/if}
</section>

<style>
  .editor {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 18px 20px 20px;
  }
  header {
    margin-bottom: 14px;
  }
  h3 {
    margin: 22px 0 10px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }
  .blank {
    padding: 8px 0 4px;
  }
  .previews {
    display: flex;
    gap: 14px;
    align-items: flex-end;
  }
  figure {
    margin: 0;
    width: 96px;
    border-radius: 10px;
    overflow: visible;
    position: relative;
  }
  figure.wide {
    width: 224px;
  }
  figure :global(canvas) {
    border-radius: 10px;
    box-shadow: 0 0 0 1px var(--line);
  }
  figcaption {
    position: absolute;
    top: 100%;
    margin-top: 4px;
  }
  .previews:has(figcaption) {
    margin-bottom: 22px;
  }
  .on {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }
</style>
