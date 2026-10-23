// Browser side of scripts/build.mjs. Nothing personal can be read until every
// lock share is recovered from the right answers.

const subtle = crypto.subtle;
const enc = new TextEncoder();

export const normalize = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

export const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));

async function answerKey(answer, salt, iterations) {
  const base = await subtle.importKey('raw', enc.encode(normalize(answer)), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
}

async function open(key, blob) {
  const iv = blob.subarray(0, 12);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, key, blob.subarray(12)));
}

/** Returns the lock's 32-byte share if the answer is right, otherwise null. */
export async function tryLock(lock, answer, iterations) {
  if (!normalize(answer)) return null;
  const key = await answerKey(answer, fromB64(lock.salt), iterations);
  for (const w of lock.wraps) {
    try {
      return await open(key, fromB64(w));
    } catch {
      // wrong key for this wrap, try the next spelling
    }
  }
  return null;
}

export async function contentKey(shares, vault) {
  const ikm = new Uint8Array(shares.reduce((a, s) => a.concat([...s]), []));
  const base = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: fromB64(vault.hkdfSalt), info: enc.encode(vault.info) },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
}

export async function openBlob(key, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return open(key, new Uint8Array(await res.arrayBuffer()));
}
