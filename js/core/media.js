import { openBlob } from './crypto.js?v=6af64c95';

// Photos and videos are stored encrypted like everything else. This fetches
// one, decrypts it in memory and hands back a local blob: URL.

const cache = new Map();

export function mediaUrl(ctx, name) {
  if (!cache.has(name)) {
    const entry = ctx.manifest.media[name];
    if (!entry) return Promise.reject(new Error(`no media named ${name}`));
    cache.set(name, openBlob(ctx.key, `vault/${entry.id}.bin`).then((bytes) =>
      URL.createObjectURL(new Blob([bytes], { type: entry.type }))));
  }
  return cache.get(name);
}

/** Starts decrypting in the background so it is ready when needed. */
export function preload(ctx, names) {
  for (const n of names) mediaUrl(ctx, n).catch(() => {});
}
