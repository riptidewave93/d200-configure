<!-- Where the page shown sits: home › folder › page. When the page tree is hidden (narrow windows), the last step opens it. -->
<script lang="ts">
  import type { Doc } from "../lib/doc.svelte";
  import PageTree from "./PageTree.svelte";

  let { doc }: { doc: Doc } = $props();
  let open = $state(false);
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (open = false)} />

<nav class="crumbs" aria-label="Where you are">
  {#each doc.path as p, i (p)}
    {#if i > 0}<span class="sep" aria-hidden="true">›</span>{/if}
    {#if i < doc.path.length - 1}
      <button class="step" onclick={() => doc.openPage(p)}>{p}</button>
    {:else}
      <span class="here">{p}</span>
      <button class="quiet more" onclick={() => (open = !open)} aria-expanded={open} aria-label="All pages">▾</button>
    {/if}
  {/each}
  {#if open}
    <div class="popover">
      <PageTree {doc} onpick={() => (open = false)} />
    </div>
  {/if}
</nav>

<style>
  .crumbs {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-height: 34px;
  }
  .step {
    background: none;
    color: var(--muted);
    font-weight: 400;
    padding: 4px 2px;
  }
  .step:hover {
    color: var(--fg);
  }
  .sep {
    color: var(--muted);
  }
  .here {
    font-weight: 500;
  }
  /* the tree is in the side rail on wide windows */
  .more {
    display: none;
    padding: 4px 6px;
    min-width: 32px;
    min-height: 32px;
    justify-content: center;
  }
  .popover {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 10;
    width: min(280px, calc(100vw - 32px));
    max-height: 60vh;
    overflow-y: auto;
    padding: 12px 8px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 16px 40px -12px var(--shadow);
  }
  @media (max-width: 1100px) {
    .more {
      display: inline-flex;
    }
  }
</style>
