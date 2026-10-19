<!-- A built-in icon, from the same path data the device draws. -->
<script lang="ts">
  import { app } from "../lib/context";

  let { name }: { name: string } = $props();

  const { deck } = app();
  let path = $derived(deck()?.iconPath(name) ?? null);
</script>

{#if path}
  <svg viewBox={path.viewBox} aria-hidden="true"><path d={path.d} fill="currentColor" /></svg>
{/if}

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
