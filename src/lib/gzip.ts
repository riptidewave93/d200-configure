// Compressing configs for the trip over USB, with the browser's own gzip.

async function all(stream: ReadableStream<Uint8Array>, max = Infinity): Promise<Uint8Array<ArrayBuffer>> {
  const parts: Uint8Array[] = [];
  let n = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await reader.cancel();
      throw new Error(`larger than ${max} bytes`);
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const stream = (b: Uint8Array) => new Blob([b as BlobPart]).stream();

export function gzip(b: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return all(stream(b).pipeThrough(new CompressionStream("gzip")));
}

// gunzip refuses to give more than max bytes.
export async function gunzip(b: Uint8Array, max: number): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await all(stream(b).pipeThrough(new DecompressionStream("gzip")), max);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("larger than")) throw err;
    throw new Error("not gzip data");
  }
}
