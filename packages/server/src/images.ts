import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db.ts';
import type { PictureFetcher } from './import/safeFetch.ts';

/** What the bytes really are (never what the server claims): a picture is only stored, and served, as one of these. SVG is left out on purpose (it can carry script). */
export function sniffImage(b: Buffer): { ext: string; type: string } | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
  if (b.subarray(0, 3).toString('latin1') === 'GIF') return { ext: 'gif', type: 'image/gif' };
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  if (b.subarray(4, 8).toString('latin1') === 'ftyp' && /avif|avis/.test(b.subarray(8, 16).toString('latin1'))) return { ext: 'avif', type: 'image/avif' };
  return null;
}

export const IMAGE_PATH = /^\/images\/([0-9a-f]{64})\.(jpg|png|gif|webp|avif)$/;
export const TYPE_OF: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };
export const isLocalImage = (u: string | null): boolean => !!u && IMAGE_PATH.test(u);

/**
 * Saves a recipe photo on this server, named by the hash of its content (the same photo is stored once, and the name can never change what it holds),
 * and returns the path to use instead of the website's address: '/images/<hash>.jpg'. Returns null when it cannot be had (the caller keeps the
 * original address, so a flaky site never loses a photo).
 */
export async function cacheImage(dir: string, url: string, fetchPicture: PictureFetcher): Promise<string | null> {
  try {
    const pic = await fetchPicture(url);
    const kind = sniffImage(pic.bytes);
    if (!kind) return null;
    const name = `${createHash('sha256').update(pic.bytes).digest('hex')}.${kind.ext}`;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, name);
    if (!existsSync(file)) writeFileSync(file, pic.bytes);
    return `/images/${name}`;
  } catch { return null; }
}

/** Makes photos already saved (before caching existed) local too, one after another in the background. Returns how many were cached. */
export async function cacheAllRecipeImages(db: Db, dir: string, fetchPicture: PictureFetcher): Promise<number> {
  const rows = db.prepare("SELECT id, image_url FROM recipes WHERE image_url LIKE 'http%'").all() as { id: number; image_url: string }[];
  let n = 0;
  for (const r of rows) {
    const local = await cacheImage(dir, r.image_url, fetchPicture);
    if (local) { db.prepare('UPDATE recipes SET image_url = ? WHERE id = ?').run(local, r.id); n++; }
  }
  return n;
}
