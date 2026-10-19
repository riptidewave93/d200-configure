<!-- The selected key: its look, what it does, and its look while on. -->
<script lang="ts">
  import { actionTypes } from "../lib/actions";
  import { app } from "../lib/context";
  import ActionEditor from "./ActionEditor.svelte";
  import LookFields from "./LookFields.svelte";

  let { key }: { key: number } = $props();

  const { doc, device } = app();
  let button = $derived(doc.button(key));
  const types = actionTypes.map((a) => a.type);
</script>

<div class="card">
  <div class="row head">
    <h2 class="grow">Key</h2>
    {#if device.state === "ready"}
      <button class="plain" onclick={() => device.identify(key)}>Show on device</button>
    {/if}
    {#if button}<button class="plain" onclick={() => doc.setButton(key, undefined)}>Clear</button>{/if}
  </div>

  {#if !button}
    <p class="muted">This key is blank.</p>
    <button onclick={() => doc.setButton(key, { action: {} })}>Set it up</button>
  {:else}
    <LookFields look={button} />
    <ActionEditor bind:action={button.action} {types} />
    {#if button.action.type === "app"}
      <details class="on" open={!!button.on}>
        <summary>Look while on, e.g. while muted</summary>
        {#if button.on}
          <LookFields look={button.on} />
          <button class="plain" onclick={() => delete button.on}>Use the built-in look</button>
        {:else}
          <p class="muted">The built-in look, if there is one.</p>
          <button class="plain" onclick={() => (button.on = {})}>+ Own look</button>
        {/if}
      </details>
    {/if}
  {/if}
</div>

<style>
  .head {
    margin-bottom: 8px;
  }
  .head h2 {
    margin: 0;
  }
  .on {
    margin-top: 12px;
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
  summary {
    color: var(--muted);
    cursor: pointer;
    margin-bottom: 8px;
  }
</style>
