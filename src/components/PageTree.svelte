<!-- The pages as a tree, from the home page down the keys that open them. -->
<script lang="ts">
  import type { Doc } from "../lib/doc.svelte";
  import type { PageNode } from "../lib/pages";

  let { doc, onpick }: { doc: Doc; onpick?: () => void } = $props();

  function open(page: string) {
    doc.openPage(page);
    onpick?.();
  }

  function add() {
    doc.addPage(doc.newPageName());
    onpick?.();
  }
</script>

{#snippet row(page: string, depth: number)}
  <button
    class="page"
    class:on={page === doc.page}
    style:padding-left="{10 + depth * 14}px"
    aria-current={page === doc.page ? "page" : undefined}
    onclick={() => open(page)}
  >
    {#if page === doc.config?.home}<span class="home" title="Shown when the device starts" aria-label="Home:">⌂</span
      >{/if}
    <span class="name">{page}</span>
  </button>
{/snippet}

{#snippet node(n: PageNode, depth: number)}
  <li>
    {@render row(n.page, depth)}
    {#if n.children.length}
      <ul>
        {#each n.children as c (c.page)}{@render node(c, depth + 1)}{/each}
      </ul>
    {/if}
  </li>
{/snippet}

<nav aria-label="Pages">
  <h2>Pages</h2>
  <ul>
    {#if doc.tree.root}{@render node(doc.tree.root, 0)}{/if}
  </ul>
  {#if doc.tree.orphans.length}
    <h3>Not opened by any key</h3>
    <ul>
      {#each doc.tree.orphans as p (p)}<li>{@render row(p, 0)}</li>{/each}
    </ul>
  {/if}
  <button class="quiet add" onclick={add}>+ Page</button>
</nav>

<style>
  h2 {
    font-size: 13px;
    color: var(--muted);
    font-weight: 400;
    margin: 0 0 6px 10px;
  }
  h3 {
    font-size: 13px;
    color: var(--muted);
    font-weight: 400;
    margin: 18px 0 6px 10px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .page {
    display: flex;
    width: 100%;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 8px;
    background: none;
    color: var(--fg);
    font-weight: 400;
    text-align: left;
  }
  .page:hover {
    background: color-mix(in srgb, var(--fg) 6%, transparent);
  }
  .page.on {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--fg);
  }
  .home {
    color: var(--muted);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .add {
    margin: 10px 0 0 4px;
  }
</style>
