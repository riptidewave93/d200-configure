<!-- What a key does. Also used for macro steps and fallbacks, with fewer types. -->
<script lang="ts">
  import type { Action, Look } from "../lib/config";
  import {
    appNames,
    argNames,
    defaultSongCycle,
    describe,
    fallbackTypes,
    isPC,
    joinCommand,
    kind,
    maxSongCycle,
    newAction,
    opArgs,
    opName,
    openApp,
    realType,
    splitCommand,
    stepTypes,
    songShows,
    systemNames,
    typeName,
    typeTextProblem,
    usageNames,
  } from "../lib/actions";
  import { app } from "../lib/context";
  import { set } from "../lib/edit";
  import { loadLogos } from "../lib/logos";
  import { appPrograms, giveLook, program, type Program } from "../lib/programs";
  import ActionEditor from "./ActionEditor.svelte";
  import ComboField from "./ComboField.svelte";
  import ProgramPicker from "./ProgramPicker.svelte";
  import { comboField, macKeys } from "../lib/mac";
  import { formatCombo } from "../lib/keys";
  import { giveShortcut, matching, meetingApp, meetingApps, offered as canGive, shortcuts } from "../lib/meetings";

  // look: the key's, which an "Open app" key without one of its own takes
  // from the app
  let {
    action = $bindable(),
    types,
    label = "Does",
    look,
  }: { action: Action; types: string[]; label?: string | null; look?: Look & { on?: Look } } = $props();

  const { doc, device, deck, features } = app();
  // what the device supports, plus what this action already has, so the
  // lists show it (saving says what the device can't take)
  let f = $derived(features());
  // a key combo shows, and edits, the combo for this computer
  let mac = $derived(macKeys(f));
  let combo = $derived(comboField(action, device.os, mac));
  // the combo on the other kind of computer, when it differs
  let otherCombo = $derived(
    action.type !== "hid-key" || !action.mac_keys
      ? ""
      : combo === "mac_keys"
        ? `Windows and Linux: ${formatCombo(action.keys)}`
        : `Mac: ${formatCombo(action.mac_keys)}`,
  );
  let meeting = $derived(matching(action));
  // ready-made keys: for the key itself, not a step or fallback
  let readyMade = $derived(!!look && (!action.type || action.type === "hid-key" || meeting.length > 0));
  const plus = (l: string[] | undefined, v: unknown) =>
    l && typeof v === "string" && v && !l.includes(v) ? [...l, v] : l;
  let offered = $derived(types.filter((t) => !t || !f || f.actions.includes(realType(t)) || t === kind(action)));
  let known = $derived(new Set([...(f?.keys ?? []), ...(f?.modifiers ?? [])]));
  let apps = $derived.by(() => {
    const a: Record<string, string[]> = { ...(f?.apps ?? {}) };
    if (action.app) a[action.app] = plus(a[action.app] ?? [], action.op)!;
    return Object.fromEntries(
      Object.entries(a).filter(([k, ops]) => k !== appPrograms && (ops.length || k === action.app)),
    );
  });
  // an app's args the device knows; one it doesn't know the app of takes any
  const argOK = (name: string) => !f?.args[action.app ?? ""] || f.args[action.app!].includes(name) || action.args?.[name] !== undefined;
  let args = $derived((opArgs[`${action.app}.${action.op}`] ?? []).filter((a) => argOK(a.name)));
  let canFallback = $derived(!!action.fallback || (f?.fields.includes("action.fallback") ?? true));
  let hostApp = $derived(device.host?.apps?.find((a) => a.name === action.app));
  // what the device does by itself while the PC helper can't, e.g. Discord
  // mute presses Ctrl+Shift+M
  let builtin = $derived(
    action.type === "app" ? (deck()?.builtinFallback({ type: "app", app: action.app, op: action.op }) ?? null) : null,
  );
  // the PC helper can't run it now
  let helperMissing = $derived(
    device.state === "ready" &&
      (!device.host?.connected || (action.type === "app" && !hostApp?.status)),
  );
  // a media key by its usage number, for one without a name
  let usageNumber = $derived(typeof action.usage === "number");

  // a new page being named, from the page list's "New page…"
  const NEW = "\u0000new";
  let newPage = $state<string | null>(null);
  let newPageError = $derived(newPage === null ? "" : doc.pageNameError(newPage));

  function setType(t: string) {
    action = newAction(t, apps, action);
  }

  async function pickProgram(p: Program) {
    const was = program(action.args?.id);
    action.args = { id: p.id };
    if (look && doc.config) giveLook(doc.config, look, p, was, await loadLogos().catch(() => []));
  }

  async function pickShortcut(i: number) {
    const logos = await loadLogos().catch(() => []);
    giveShortcut(action, look ?? {}, shortcuts[i], logos);
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

  // a new op keeps only the args it reads
  function setOp(op: string) {
    action.op = op;
    const keep = argNames(action.app, op);
    const a = Object.fromEntries(Object.entries(action.args ?? {}).filter(([k]) => keep.includes(k)));
    set(action, "args", a);
  }

  function setShow(v: string) {
    const a = { ...(action.args ?? {}) };
    if (v === "art") delete a.show;
    else a.show = v;
    if (v !== "both") delete a.cycle;
    set(action, "args", a);
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
  <select value={kind(action)} onchange={(e) => setType(e.currentTarget.value)} aria-label={label ?? "Action"}>
    {#if offered.some((t) => !isPC(t))}
      <optgroup label="On the device">
        {#each offered.filter((t) => !isPC(t)) as t (t)}<option value={t}>{typeName(t)}</option>{/each}
      </optgroup>
    {/if}
    {#if offered.some(isPC)}
      <optgroup label="On the PC (needs the PC helper)">
        {#each offered.filter(isPC) as t (t)}<option value={t}>{typeName(t)}</option>{/each}
      </optgroup>
    {/if}
  </select>
</label>

{#if readyMade}
  <select
    value=""
    onchange={(e) => {
      pickShortcut(Number(e.currentTarget.value));
      e.currentTarget.value = "";
    }}
    aria-label="Ready-made"
    class="ready"
  >
    <option value="" disabled>Ready-made…</option>
    {#each meetingApps as m (m.id)}
      {#if shortcuts.some((s) => s.app === m.id && canGive(s, f))}
        <optgroup label={m.title}>
          {#each shortcuts as s, i (i)}{#if s.app === m.id && canGive(s, f)}<option value={i}>{s.title}</option>{/if}{/each}
        </optgroup>
      {/if}
    {/each}
  </select>
{/if}

{#if action.type === "hid-key"}
  <ComboField keys={action[combo]} {known} onchange={(k) => set(action, combo, k)} />
  {#if otherCombo}<p class="muted small">{otherCombo}</p>{/if}
{:else if action.type === "hid-consumer"}
  <select
    value={usageNumber ? "number" : action.usage}
    onchange={(e) => (action.usage = e.currentTarget.value === "number" ? 0xcd : e.currentTarget.value)}
    aria-label="Media key"
  >
    {#each plus(f?.usages, action.usage) ?? Object.keys(usageNames) as u (u)}<option value={u}>{usageNames[u] ?? u}</option>{/each}
    <option value="number">Other, by usage number</option>
  </select>
  {#if usageNumber}
    <label>
      <span>HID consumer usage number</span>
      <input type="number" min="1" max="65535" bind:value={action.usage} />
    </label>
  {/if}
{:else if action.type === "hid-system"}
  <select bind:value={action.system} aria-label="Sleep or power off">
    {#each plus(f?.systems, action.system) ?? Object.keys(systemNames) as s (s)}<option value={s}>{systemNames[s] ?? s}</option>{/each}
  </select>
{:else if action.type === "type-text"}
  <label>
    <span>Text, typed as on a US keyboard</span>
    <textarea rows="3" bind:value={() => action.text ?? "", (v) => set(action, "text", v)}></textarea>
  </label>
  {#if typeTextProblem(action.text)}<p class="bad small">{typeTextProblem(action.text)}</p>{/if}
{:else if action.type === "delay"}
  <label>
    <span>Milliseconds</span>
    <input type="number" min="1" max="60000" bind:value={action.ms} />
  </label>
{:else if action.type === "macro"}
  <ul class="steps">
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
  </ul>
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
    <input type="url" placeholder="e.g. https://example.com" bind:value={() => action.url ?? "", (v) => set(action, "url", v)} />
  </label>
{:else if action.type === "launch"}
  <label>
    <span>Program and arguments</span>
    <input
      placeholder="e.g. code ~/notes"
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
      placeholder="e.g. https://example.com/hook"
      aria-label="Web address"
      bind:value={() => action.url ?? "", (v) => set(action, "url", v)}
    />
  </div>
  <label>
    <span>Headers, one per line</span>
    <textarea
      rows="2"
      placeholder="e.g. Content-Type: application/json"
      value={headersText(action.headers)}
      onchange={(e) => set(action, "headers", parseHeaders(e.currentTarget.value))}
    ></textarea>
  </label>
  <label>
    <span>Body</span>
    <textarea rows="3" bind:value={() => action.body ?? "", (v) => set(action, "body", v)}></textarea>
  </label>
{:else if kind(action) === openApp}
  <ProgramPicker value={action.args?.id as string | undefined} onpick={pickProgram} />
{:else if action.type === "app"}
  <div class="row">
    <select value={action.app} onchange={(e) => setApp(e.currentTarget.value)} aria-label="App">
      {#each Object.keys(apps) as a (a)}<option value={a}>{appNames[a] ?? a}</option>{/each}
    </select>
    <select class="grow" value={action.op} onchange={(e) => setOp(e.currentTarget.value)} aria-label="App action">
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
  {#if action.app === "media" && action.op === "now-playing" && argOK("show")}
    <label>
      <span>Shows</span>
      <select value={action.args?.show ?? "art"} onchange={(e) => setShow(e.currentTarget.value)}>
        {#each Object.entries(songShows) as [v, name] (v)}<option value={v}>{name}</option>{/each}
      </select>
    </label>
    {#if action.args?.show === "both"}
      <label>
        <span>Seconds each (default {defaultSongCycle})</span>
        <input
          type="number"
          min="1"
          max={f?.limits.song_cycle ?? maxSongCycle}
          value={action.args?.cycle ?? ""}
          onchange={(e) => setArg("cycle", e.currentTarget.value, true)}
        />
      </label>
    {/if}
    <p class="muted small">The device draws the song playing on the PC on this key.</p>
  {/if}
{/if}

{#if look}
  {#each meeting as s (s.app)}
    <p class="muted small">{meetingApp(s.app)?.note}{s.note ? ` ${s.note}` : ""}</p>
  {/each}
{/if}

{#if isPC(action.type) && helperMissing}
  <p class="muted">
    {!device.host?.connected
      ? "The PC helper isn't running"
      : `${appNames[action.app ?? ""] ?? action.app} isn't set up in the PC helper yet`}{action.fallback
      ? ", so the device does the fallback below instead."
      : builtin
        ? `, so the device presses ${describe(builtin, device.os, mac)} instead.`
        : ", so this won't work yet."}
  </p>
{/if}

{#if isPC(action.type) && types.some(isPC) && canFallback}
  <details class="fallback" open={!!action.fallback}>
    <summary>Without the PC helper</summary>
    {#if action.fallback}
      <ActionEditor bind:action={action.fallback} types={fallbackTypes} label="Instead, the device does" />
      <button type="button" class="plain" onclick={() => delete action.fallback}>Remove</button>
    {:else}
      {#if builtin}<p class="muted small">Built in: {describe(builtin, device.os, mac)}. Set something else to replace it.</p>{/if}
      <button type="button" class="plain" onclick={() => (action.fallback = { type: "hid-key", keys: [] })}
        >+ Something the device does instead</button
      >
    {/if}
  </details>
{/if}

<style>
  .steps {
    list-style: none;
    padding-left: 0;
    margin: 0 0 8px;
  }
  .steps li {
    margin-bottom: 8px;
  }
  .method {
    width: auto;
  }
  .ready {
    margin-bottom: 8px;
  }
  .fallback {
    margin-top: 12px;
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
  summary {
    margin-bottom: 8px;
  }
</style>
