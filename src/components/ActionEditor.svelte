<!-- What a key does. Also used for macro steps and fallbacks, with fewer types. -->
<script lang="ts">
  import type { Action } from "../lib/config";
  import {
    appNames,
    fallbackTypes,
    isPC,
    joinCommand,
    mediaNeedsHelper,
    opArgs,
    opName,
    splitCommand,
    stepTypes,
    systemNames,
    typeName,
    usageNames,
  } from "../lib/actions";
  import { app } from "../lib/context";
  import { set } from "../lib/edit";
  import ActionEditor from "./ActionEditor.svelte";
  import ComboField from "./ComboField.svelte";

  let {
    action = $bindable(),
    types,
    label = "Does",
  }: { action: Action; types: string[]; label?: string | null } = $props();

  const { doc, device, deck } = app();
  let names = $derived(deck()?.names);
  let known = $derived(new Set([...(names?.keys ?? []), ...(names?.modifiers ?? [])]));
  let apps = $derived(names?.apps ?? {});
  let args = $derived(opArgs[`${action.app}.${action.op}`] ?? []);
  let hostApp = $derived(device.host?.apps?.find((a) => a.name === action.app));

  // a new page being named, from the page list's "New page…"
  const NEW = "\u0000new";
  let newPage = $state<string | null>(null);
  let newPageError = $derived(newPage === null ? "" : doc.pageNameError(newPage));

  function setType(t: string) {
    const next: Action = t ? { type: t } : {};
    if (t === "app") {
      next.app = Object.keys(apps)[0] ?? "discord";
      next.op = apps[next.app]?.[0] ?? "mute";
    }
    if (t === "macro") next.steps = [];
    if (t === "http") next.method = "POST";
    if (t === "delay") next.ms = 100;
    if (isPC(t) && action.fallback) next.fallback = action.fallback;
    action = next;
  }

  // another app: its first op, and none of the last one's args
  function setApp(a: string) {
    action.app = a;
    action.op = apps[a]?.[0] ?? "";
    delete action.args;
  }

  const headersText = (h: Record<string, string> = {}) =>
    Object.entries(h)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

  function parseHeaders(s: string): Record<string, string> {
    const h: Record<string, string> = {};
    for (const line of s.split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return h;
  }

  function setArg(name: string, v: string, number = false) {
    const a = { ...(action.args ?? {}) };
    if (v === "") delete a[name];
    else a[name] = number ? Number(v) : v;
    set(action, "args", a);
  }

  function moveStep(i: number, by: number) {
    const s = action.steps!;
    [s[i], s[i + by]] = [s[i + by], s[i]];
  }
</script>

<label>
  {#if label}<span>{label}</span>{/if}
  <select value={action.type ?? ""} onchange={(e) => setType(e.currentTarget.value)} aria-label={label ?? "Action"}>
    {#if types.some((t) => !isPC(t))}
      <optgroup label="On the device">
        {#each types.filter((t) => !isPC(t)) as t (t)}<option value={t}>{typeName(t)}</option>{/each}
      </optgroup>
    {/if}
    {#if types.some(isPC)}
      <optgroup label="On the PC (needs the PC helper)">
        {#each types.filter(isPC) as t (t)}<option value={t}>{typeName(t)}</option>{/each}
      </optgroup>
    {/if}
  </select>
</label>

{#if action.type === "hid-key"}
  <ComboField keys={action.keys} {known} onchange={(k) => set(action, "keys", k)} />
{:else if action.type === "hid-consumer"}
  <select bind:value={action.usage} aria-label="Media key">
    {#each names?.usages ?? Object.keys(usageNames) as u (u)}<option value={u}>{usageNames[u] ?? u}</option>{/each}
  </select>
{:else if action.type === "hid-system"}
  <select bind:value={action.system} aria-label="Sleep or power off">
    {#each names?.systems ?? Object.keys(systemNames) as s (s)}<option value={s}>{systemNames[s] ?? s}</option>{/each}
  </select>
{:else if action.type === "type-text"}
  <label>
    <span>Text, typed as on a US keyboard</span>
    <textarea rows="3" bind:value={() => action.text ?? "", (v) => set(action, "text", v)}></textarea>
  </label>
{:else if action.type === "delay"}
  <label>
    <span>Milliseconds</span>
    <input type="number" min="1" max="60000" bind:value={action.ms} />
  </label>
{:else if action.type === "macro"}
  <ol class="steps">
    {#each action.steps ?? [] as _, i (i)}
      <li>
        <ActionEditor bind:action={action.steps![i]} types={stepTypes} label="Step {i + 1}" />
        <div class="row">
          <button type="button" class="plain" disabled={i === 0} onclick={() => moveStep(i, -1)}>Up</button>
          <button type="button" class="plain" disabled={i === action.steps!.length - 1} onclick={() => moveStep(i, 1)}
            >Down</button
          >
          <button type="button" class="plain" onclick={() => action.steps!.splice(i, 1)}>Remove</button>
        </div>
      </li>
    {/each}
  </ol>
  <button type="button" class="plain" onclick={() => (action.steps ??= []).push({ type: "hid-key", keys: [] })}
    >+ Step</button
  >
{:else if action.type === "page"}
  {#if newPage === null}
    <div class="row">
      <select
        class="grow"
        value={action.page ?? ""}
        onchange={(e) => {
          if (e.currentTarget.value === NEW) {
            newPage = doc.button(doc.key ?? -1)?.label?.replace(/\n/g, " ").trim() || doc.newPageName();
            e.currentTarget.value = action.page ?? "";
          } else {
            action.page = e.currentTarget.value;
          }
        }}
        aria-label="Page"
      >
        {#if !action.page}<option value="" disabled>Pick a page</option>{/if}
        {#each doc.pages as p (p)}<option value={p}>{p}</option>{/each}
        <option value={NEW}>New page…</option>
      </select>
      {#if action.page && action.page in (doc.config?.pages ?? {})}
        <button type="button" class="plain" onclick={() => doc.openPage(action.page!)}>Open ›</button>
      {/if}
    </div>
  {:else}
    <form
      class="row"
      onsubmit={(e) => {
        e.preventDefault();
        if (newPageError) return;
        doc.addFolder(newPage!);
        action.page = newPage!;
        newPage = null;
      }}
    >
      <!-- svelte-ignore a11y_autofocus -->
      <input class="grow" bind:value={newPage} aria-label="New page name" autofocus />
      <button disabled={!!newPageError}>Add page</button>
      <button type="button" class="quiet" onclick={() => (newPage = null)}>Cancel</button>
    </form>
    {#if newPageError && newPage}<p class="bad small">{newPageError}</p>{/if}
    <p class="muted small">It gets a Back key, so you can leave it on the device.</p>
  {/if}
{:else if action.type === "open-url"}
  <label>
    <span>Web address</span>
    <input type="url" placeholder="https://" bind:value={() => action.url ?? "", (v) => set(action, "url", v)} />
  </label>
{:else if action.type === "launch"}
  <label>
    <span>Program and arguments</span>
    <input
      placeholder="code ~/notes"
      value={joinCommand(action.command)}
      onchange={(e) => set(action, "command", splitCommand(e.currentTarget.value))}
    />
  </label>
{:else if action.type === "http"}
  <div class="row">
    <select class="method" bind:value={action.method} aria-label="Method">
      {#each ["GET", "POST", "PUT", "PATCH", "DELETE"] as m (m)}<option>{m}</option>{/each}
    </select>
    <input
      class="grow"
      type="url"
      placeholder="https://"
      aria-label="Web address"
      bind:value={() => action.url ?? "", (v) => set(action, "url", v)}
    />
  </div>
  <label>
    <span>Headers, one per line</span>
    <textarea
      rows="2"
      placeholder="Content-Type: application/json"
      value={headersText(action.headers)}
      onchange={(e) => set(action, "headers", parseHeaders(e.currentTarget.value))}
    ></textarea>
  </label>
  <label>
    <span>Body</span>
    <textarea rows="3" bind:value={() => action.body ?? "", (v) => set(action, "body", v)}></textarea>
  </label>
{:else if action.type === "app"}
  <div class="row">
    <select value={action.app} onchange={(e) => setApp(e.currentTarget.value)} aria-label="App">
      {#each Object.keys(apps) as a (a)}<option value={a}>{appNames[a] ?? a}</option>{/each}
    </select>
    <select class="grow" bind:value={action.op} aria-label="App action">
      {#each apps[action.app ?? ""] ?? [] as op (op)}<option value={op}>{opName(action.app, op)}</option>{/each}
    </select>
  </div>
  {#each args as a (a.name)}
    <label>
      <span>{a.label}</span>
      <input
        type={a.number ? "number" : "text"}
        value={action.args?.[a.name] ?? ""}
        onchange={(e) => setArg(a.name, e.currentTarget.value, a.number)}
      />
    </label>
  {/each}
{/if}

{#if isPC(action.type) && device.state === "ready"}
  {#if action.type === "app" && action.app === "media" && !mediaNeedsHelper.has(action.op ?? "")}
    {#if !device.host?.connected}<p class="muted">Without the PC helper, it works as the plain media key.</p>{/if}
  {:else if !device.host?.connected}
    <p class="muted">The PC helper isn't running, so this won't work yet.</p>
  {:else if action.type === "app" && !hostApp?.status}
    <p class="muted">{appNames[action.app ?? ""] ?? action.app} isn't set up in the PC helper yet.</p>
  {/if}
{/if}

{#if isPC(action.type) && types.some(isPC)}
  <details class="fallback" open={!!action.fallback}>
    <summary>Without the PC helper</summary>
    {#if action.fallback}
      <ActionEditor bind:action={action.fallback} types={fallbackTypes} label="Instead, the device does" />
      <button type="button" class="plain" onclick={() => delete action.fallback}>Remove</button>
    {:else}
      <button type="button" class="plain" onclick={() => (action.fallback = { type: "hid-key", keys: [] })}
        >+ Something the device does instead</button
      >
    {/if}
  </details>
{/if}

<style>
  .steps {
    padding-left: 20px;
    margin: 0 0 8px;
  }
  .steps li {
    margin-bottom: 8px;
  }
  .method {
    width: auto;
  }
  .fallback {
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
