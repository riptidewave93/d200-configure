<!-- An icon by name, from the same path data the device draws: the config's own, else a built-in one. -->
<script lang="ts">
  import { app } from "../lib/context";
  import type { IconPath } from "../lib/deck";
  import { iconPath, iconsReady, loadIcons } from "../lib/icons.svelte";

  // path draws one that isn't in the config yet
  let { name, path: given }: { name: string; path?: IconPath } = $props();

  const { doc } = app();
  let own = $derived(doc.config?.icons?.[name]);
  let path = $derived(given ?? (own?.d ? { d: own.d, viewBox: own.viewBox ?? "0 0 24 24" } : iconPath(name)) ?? null);
  $effect(() => {
    if (!given && !own && !iconsReady()) loadIcons();
  });
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
