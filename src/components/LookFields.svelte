<!-- How a key looks: icon or image, label, font and colours. -->
<script lang="ts">
  import { MaxIconBytes, MaxImageBytes, type Look } from "../lib/config";
  import { emojiID, emojiPNG, type Emoji } from "../lib/emoji";
  import { app } from "../lib/context";
  import { set } from "../lib/edit";
  import { addCatalogFont, addFontFile, catalogFonts, fontName } from "../lib/fonts";
  import { animBudget, animatedBytes, fitNote, iconSide, pictureID, readPicture, share } from "../lib/pictures";
  import ColorField from "./ColorField.svelte";
  import IconField from "./IconField.svelte";

  // key: the key it's on, for the size images are fitted to
  let { look, key }: { look: Look; key: number } = $props();
  const uid = $props.id();

  const { doc, deck, features } = app();
  let f = $derived(features());
  // what the device supports, or this look already uses (to change it)
  const can = (...fields: string[]) => !f || fields.every((x) => f!.fields.includes(x));
  let canFonts = $derived(can("button.font") || !!look.font);
  let canCustomFonts = $derived(can("config.fonts"));
  let canImages = $derived(can("button.image", "config.images") || !!look.image);
  let canPictureIcons = $derived(can("icon.png"));
  let maxLabel = $derived(f?.limits.label ?? 32);
  let maxLines = $derived(f?.limits.label_lines ?? 3);
  let images = $derived(Object.keys(doc.config?.images ?? {}).sort());
  let customFonts = $derived(Object.keys(doc.config?.fonts ?? {}).sort());
  let builtinFonts = $derived.by(() => {
    const l = f?.fonts ?? [];
    const font = look.font;
    return font && !l.includes(font) && !doc.config?.fonts?.[font] ? [...l, font] : l;
  });
  // catalog fonts not in the config yet
  let moreFonts = $derived(catalogFonts.filter((f) => !doc.config?.fonts?.[f.id]));

  // A catalog font goes in the config when it's picked; "From a file…" asks
  // for one.
  const fromFile = "\u0000file";
  let fontInput: HTMLInputElement;
  let fontWorking = $state(false);
  let fontNote = $state("");
  let fontError = $state("");

  // why, as one sentence: a reason that's already one stands alone
  function because(lead: string, err: unknown): string {
    const s = (err instanceof Error ? err.message : String(err)).replace(/\.$/, "");
    return s.startsWith("That ") ? `${s}.` : `${lead}: ${s.charAt(0).toLowerCase()}${s.slice(1)}.`;
  }

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
      fontError = because("That font can't be used", err);
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
    doc.config!.icons ??= {};
    const icons = doc.config!.icons;
    if (!icons[id]?.png) {
      try {
        let png = await emojiPNG(e.char);
        if (atob(png).length > (f?.limits.icon_bytes ?? MaxIconBytes)) png = await emojiPNG(e.char, 96);
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

  async function addPicture(file: File | undefined) {
    const d = deck();
    if (!file || !d || !adding) return;
    pictureNote = pictureError = "";
    working = true;
    try {
      const bytes = await readPicture(file);
      const c = doc.config!;
      // a GIF gets what the page's others leave of the animation budget
      const budget = animBudget(f?.limits);
      const others = animatedBytes(c, d, doc.page, budget, look);
      if (adding === "image") {
        const k = d.layout.keys[key];
        const side = f?.limits.image_side ?? 512;
        const [w, h] = [Math.min(k.w, side), Math.min(k.h, side)];
        const fit = d.fitImage(bytes, w, h, f?.limits.image_bytes ?? MaxImageBytes, share(budget, others, w, h));
        const id = pictureID(file.name, Object.keys(c.images ?? {}));
        c.images ??= {};
        c.images[id] = fit.data;
        setImage(id);
        pictureNote = fitNote(fit);
      } else {
        const anim = share(budget, others, iconSide, iconSide);
        const fit = d.fitImage(bytes, iconSide, iconSide, f?.limits.icon_bytes ?? MaxIconBytes, anim);
        const id = pictureID(file.name, Object.keys(c.icons ?? {}), "pic-");
        c.icons ??= {};
        c.icons[id] = { png: fit.data };
        setIcon(id);
        pictureNote = fitNote(fit);
      }
    } catch (err) {
      pictureError = because("That picture can't be used", err);
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

  let labelError = $derived.by(() => {
    const l = look.label ?? "";
    if ([...l].length > maxLabel) return `Up to ${maxLabel} characters.`;
    if (l.split("\n").length > maxLines) return `Up to ${maxLines} lines.`;
    return "";
  });
</script>

<IconField
  value={look.icon}
  onchange={setIcon}
  onemoji={canPictureIcons ? setEmoji : undefined}
  onpicture={canPictureIcons ? () => choose("icon") : undefined}
/>
{#if emojiError}<p class="bad small">{emojiError}</p>{/if}
{#if canImages}
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
{/if}
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

{#if canFonts}
<div class="row">
  <label class="grow">
    <span>Font</span>
    <select value={look.font ?? ""} onchange={pickFont} disabled={fontWorking}>
      <option value="">Default</option>
      <optgroup label="On the device">
        {#each builtinFonts as name (name)}<option value={name}>{fontName(name)}</option>{/each}
      </optgroup>
      {#if customFonts.length}
        <optgroup label="In this config">
          {#each customFonts as id (id)}<option value={id}>{fontName(id)}</option>{/each}
        </optgroup>
      {/if}
      {#if canCustomFonts}
        <optgroup label="More fonts">
          {#each moreFonts as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          <option value={fromFile}>From a file…</option>
        </optgroup>
      {/if}
    </select>
  </label>
</div>
{/if}
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
