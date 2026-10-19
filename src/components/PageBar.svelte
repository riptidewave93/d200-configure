<!-- The config's pages as tabs, and adding, renaming and deleting them. -->
<script lang="ts">
  import type { Doc } from "../lib/doc.svelte";

  let { doc }: { doc: Doc } = $props();

  // "add" or the page being renamed, while the name box is open
  let editing = $state<string | null>(null);
  let name = $state("");
  let error = $derived(editing === null || name === editing ? "" : doc.pageNameError(name));

  function start(what: string) {
    editing = what;
    name = what === "add" ? "" : what;
  }

  function done() {
    if (error || editing === null) return;
    if (editing === "add") doc.addPage(name);
    else doc.renamePage(editing, name);
    editing = null;
  }

  function remove() {
    const page = doc.page;
    const n = doc.keysOpening(page).length;
    const also = n ? ` The ${n === 1 ? "key" : `${n} keys`} that open it will be cleared.` : "";
    if (confirm(`Delete the page "${page}"?${also}`)) doc.deletePage(page);
  }
</script>

<div class="bar">
  <div class="tabs" role="tablist">
    {#each doc.pages as p (p)}
      <button
        role="tab"
        class="tab"
        class:on={p === doc.page}
        aria-selected={p === doc.page}
        onclick={() => {
          doc.page = p;
          doc.key = null;
        }}
      >
        {p}{#if p === doc.config?.home}<span class="muted">{" "}(home)</span>{/if}
      </button>
    {/each}
    <button class="plain" onclick={() => start("add")}>+ Page</button>
  </div>

  {#if editing !== null}
    <form
      class="row"
      onsubmit={(e) => {
        e.preventDefault();
        done();
      }}
    >
      <!-- svelte-ignore a11y_autofocus -->
      <input class="grow" bind:value={name} placeholder="Page name" aria-label="Page name" autofocus />
      <button disabled={!!error}>{editing === "add" ? "Add" : "Rename"}</button>
      <button type="button" class="plain" onclick={() => (editing = null)}>Cancel</button>
    </form>
    {#if error && name}<p class="bad">{error}</p>{/if}
  {:else}
    <div class="row muted">
      <button class="plain" onclick={() => start(doc.page)}>Rename</button>
      {#if doc.page !== doc.config?.home}
        <button class="plain" onclick={() => (doc.config!.home = doc.page)}>Make home</button>
        <button class="plain" onclick={remove}>Delete</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .bar {
    margin-bottom: 12px;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 4px;
  }
  .tab {
    background: none;
    color: var(--fg);
    border-radius: 6px 6px 0 0;
    padding: 6px 12px;
  }
  .tab.on {
    background: var(--card);
    box-shadow: inset 0 -2px var(--accent);
  }
</style>
