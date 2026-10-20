<!-- How a key looks: icon or image, label, font and colours. -->
<script lang="ts">
  import { MaxIconBytes, MaxImageBytes, type Look } from "../lib/config";
  import { emojiID, emojiPNG, type Emoji } from "../lib/emoji";
  import { app } from "../lib/context";
  import { set } from "../lib/edit";
  import { addCatalogFont, addFontFile, catalogFonts, fontName } from "../lib/fonts";
  import { fitNote, iconSide, pictureID, readPicture } from "../lib/pictures";
  import ColorField from "./ColorField.svelte";
  import IconField from "./IconField.svelte";

  // key: the key it's on, for the size images are fitted to
  let { look, key }: { look: Look; key: number } = $props();
  const uid = $props.id();

  const { doc, deck } = app();
  let images = $derived(Object.keys(doc.config?.images ?? {}).sort());
  let customFonts = $derived(Object.keys(doc.config?.fonts ?? {}).sort());
  let builtinFonts = $derived(deck()?.names.fonts ?? []);
  // catalog fonts not in the config yet
  let moreFonts = $derived(catalogFonts.filter((f) => !doc.config?.fonts?.[f.id]));

  // A catalog font goes in the config when it's picked; "From a file…" asks
  // for one.
  const fromFile = "\u0000file";
  let fontInput: HTMLInputElement;
  let fontWorking = $state(false);
  let fontNote = $state("");
  let fontError = $state("");

  async function pickFont(e: Event & { currentTarget: HTMLSelectElement }) {
    const v = e.currentTarget.value;
    const d = deck();
    fontNote = fontError = "";
    if (v === fromFile) {
      e.currentTarget.value = look.font ?? "";
      fontInput.click();
      return;
    }
    if (d && v && !doc.config?.fonts?.[v] && !builtinFonts.includes(v)) {
      fontWorking = true;
      try {
        await addCatalogFont(d, doc.config!, v, look.label ?? "");
      } catch (err) {
        fontError = err instanceof Error ? err.message : String(err);
        e.currentTarget.value = look.font ?? "";
        return;
      } finally {
        fontWorking = false;
      }
    }
    set(look, "font", v);
  }

  async function addFont(f: File | undefined) {
    const d = deck();
    if (!f || !d) return;
    fontNote = fontError = "";
    fontWorking = true;
    try {
      const { id, cut } = await addFontFile(d, doc.config!, f, look.label ?? "");
      set(look, "font", id);
      if (cut) fontNote = "Made smaller to fit: it keeps only the characters labels use, until the page is closed.";
    } catch (err) {
      fontError = `That font can't be used: ${err instanceof Error ? err.message : err}.`;
    } finally {
      fontWorking = false;
      fontInput.value = "";
    }
  }

  // Changing one of icon and image clears the other: a key shows one.
  function setIcon(v: string) {
    set(look, "icon", v);
    if (v) delete look.image;
  }
  // An emoji goes in the config's icons as a small PNG, once, however many
  // keys use it; saving drops it again when no key does.
  let emojiError = $state("");
  async function setEmoji(e: Emoji) {
    emojiError = "";
    const id = emojiID(e.hex);
    const icons = (doc.config!.icons ??= {});
    if (!icons[id]?.png) {
      try {
        let png = await emojiPNG(e.char);
        if (atob(png).length > MaxIconBytes) png = await emojiPNG(e.char, 96);
        icons[id] = { png };
      } catch {
        emojiError = "This browser couldn't draw that emoji.";
        return;
      }
    }
    setIcon(id);
  }

  function setImage(v: string) {
    set(look, "image", v);
    if (v) delete look.icon;
    pictureNote = "";
  }

  // A picture from a file, fitted to the device as it's added: an image
  // fills the key, a picture icon is drawn at icon size.
  let fileInput: HTMLInputElement;
  let adding = $state<"image" | "icon" | null>(null);
  let pictureNote = $state("");
  let pictureError = $state("");
  let working = $state(false);

  function choose(kind: "image" | "icon") {
    adding = kind;
    fileInput.click();
  }

  async function addPicture(f: File | undefined) {
    const d = deck();
    if (!f || !d || !adding) return;
    pictureNote = pictureError = "";
    working = true;
    try {
      const bytes = await readPicture(f);
      const c = doc.config!;
      if (adding === "image") {
        const k = d.layout.keys[key];
        const fit = d.fitImage(bytes, Math.min(k.w, 512), Math.min(k.h, 512), MaxImageBytes);
        const id = pictureID(f.name, Object.keys(c.images ?? {}));
        (c.images ??= {})[id] = fit.data;
        setImage(id);
        pictureNote = fitNote(fit);
      } else {
        const fit = d.fitImage(bytes, iconSide, iconSide, MaxIconBytes);
        const id = pictureID(f.name, Object.keys(c.icons ?? {}), "pic-");
        (c.icons ??= {})[id] = { png: fit.data };
        setIcon(id);
        pictureNote = fitNote(fit);
      }
    } catch (err) {
      pictureError = `That picture can't be used: ${err instanceof Error ? err.message : err}.`;
    } finally {
      working = false;
      fileInput.value = "";
    }
  }

  // characters the label's font doesn't have show as boxes; a font in the
  // config is asked directly, as it gains characters when labels do
  let missing = $derived.by(() => {
    const d = deck();
    if (!d || !look.label) return "";
    const font = look.font ? doc.config?.fonts?.[look.font] : undefined;
    return font ? d.fontLacks(font, look.label) : d.missingGlyphs(look);
  });

  // the device keeps up to 32 characters on up to 3 lines
  let labelError = $derived.by(() => {
    const l = look.label ?? "";
    if ([...l].length > 32) return "Up to 32 characters.";
    if (l.split("\n").length > 3) return "Up to 3 lines.";
    return "";
  });
</script>

<IconField value={look.icon} onchange={setIcon} onemoji={setEmoji} onpicture={() => choose("icon")} />
{#if emojiError}<p class="bad small">{emojiError}</p>{/if}
<div class="field">
  <span id="{uid}-image">Or image, filling the key</span>
  <div class="row">
    {#if images.length}
      <select
        class="grow"
        aria-labelledby="{uid}-image"
        value={look.image ?? ""}
        onchange={(e) => setImage(e.currentTarget.value)}
      >
        <option value="">None</option>
        {#each images as id (id)}<option value={id}>{id}</option>{/each}
      </select>
    {:else}
      <span class="grow muted">None</span>
    {/if}
    <button type="button" class="plain" disabled={working} onclick={() => choose("image")}>Add…</button>
  </div>
</div>
<input
  type="file"
  accept="image/*"
  hidden
  bind:this={fileInput}
  onchange={(e) => addPicture(e.currentTarget.files?.[0])}
/>
{#if working}<p class="muted small">Fitting the picture…</p>{/if}
{#if pictureNote}<p class="muted small">{pictureNote}</p>{/if}
{#if pictureError}<p class="bad small">{pictureError}</p>{/if}

<label>
  <span>Label</span>
  <textarea rows="2" bind:value={() => look.label ?? "", (v) => set(look, "label", v)}></textarea>
</label>
{#if labelError}<p class="bad">{labelError}</p>{/if}
{#if missing}<p class="warn small">The device can't draw {[...missing].join(" ")} in this font: it shows a box.</p>{/if}

<div class="row">
  <label class="grow">
    <span>Font</span>
    <select value={look.font ?? ""} onchange={pickFont} disabled={fontWorking}>
      <option value="">Default</option>
      <optgroup label="On the device">
        {#each builtinFonts as f (f)}<option value={f}>{f}</option>{/each}
      </optgroup>
      {#if customFonts.length}
        <optgroup label="In this config">
          {#each customFonts as f (f)}<option value={f}>{fontName(f)}</option>{/each}
        </optgroup>
      {/if}
      <optgroup label="More fonts">
        {#each moreFonts as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
        <option value={fromFile}>From a file…</option>
      </optgroup>
    </select>
  </label>
</div>
<input
  type="file"
  accept=".ttf,.otf,.woff,.woff2,font/*"
  hidden
  bind:this={fontInput}
  onchange={(e) => addFont(e.currentTarget.files?.[0])}
/>
{#if fontWorking}<p class="muted small">Adding the font…</p>{/if}
{#if fontNote}<p class="muted small">{fontNote}</p>{/if}
{#if fontError}<p class="bad small">{fontError}</p>{/if}

<div class="row colors">
  <ColorField label="Text and icon" value={look.color} fallback="#e8e8e8" onchange={(v) => set(look, "color", v)} />
  <ColorField
    label="Background"
    value={look.background}
    fallback="#1c1c1c"
    onchange={(v) => set(look, "background", v)}
  />
</div>

<style>
  .field {
    margin-bottom: 14px;
  }
  .field > span {
    display: block;
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .colors {
    gap: 16px;
    margin-bottom: 12px;
  }
</style>
