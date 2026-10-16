import { parse } from 'node-html-parser';
import { parseRecipeText, type ImportError, type ImportDraft } from '@turbopantry/shared';
import { FetchError, type PageFetcher } from './safeFetch.ts';

/**
 * Instagram posts and reels. Osta reads the caption and the comments (it does not watch the video), and so does this, for free:
 *   1. the public embed page (instagram.com/p/<code>/embed/captioned/), fetched anonymously through the same guarded fetcher as every other site;
 *   2. when Instagram hides it (a login wall, a private post, a change on their side), the user pastes the caption and any recipe comment
 *      (the share sheet / paste box), which is read by exactly the same parser. That path cannot break.
 * NOT verified against the live site (the build sandbox cannot reach Instagram): the embed markup is read by several independent strategies so one
 * change does not take everything down, and anything that is not found becomes the "paste it" message, never a wrong recipe.
 */
export const isInstagramUrl = (u: string): boolean => { try { const h = new URL(u).hostname.toLowerCase(); return h === 'instagram.com' || h.endsWith('.instagram.com'); } catch { return false; } };

export function instagramCode(u: string): string | null {
  try { return /^\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(new URL(u).pathname)?.[1] ?? null; } catch { return null; }
}

const decode = (s: string) => s.replace(/\\u([0-9a-f]{4})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\\\/g, '\\');

export interface PostText { caption: string; comments: string[]; imageUrl: string | null }

/** Pulls the caption, comments and picture out of an Instagram embed page. Returns null when none of the strategies finds a caption. */
export function readEmbed(html: string): PostText | null {
  const root = parse(html);
  const textOf = (n: { text: string; innerHTML: string }) => n.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:div|p)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  let caption = '';
  // 1. the visible caption block of the embed
  const cap = root.querySelector('.Caption') ?? root.querySelectorAll('[class*="Caption"]').find((n) => !/Comments/.test(n.getAttribute('class') ?? ''));
  if (cap) {
    const clone = parse(cap.outerHTML);
    clone.querySelectorAll('.CaptionUsername, a[class*="Username"], .CaptionComments, [class*="CaptionComments"]').forEach((n) => n.remove());
    caption = textOf(clone);
  }
  // 2. the data blob that the embed ships with: "caption":{"text":"..."} / "edge_media_to_caption"
  if (!caption) {
    const m = /"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\{\s*"node"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(html) ?? /"caption"\s*:\s*\{[^{}]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(html) ?? /\\"caption\\"\s*:\s*\{[^{}]*?\\"text\\"\s*:\s*\\"((?:[^"\\]|\\.)*?)\\"/.exec(html);
    if (m) caption = decode(m[1]!);
  }
  // 3. the page description: 'N likes, M comments - user on Date: "caption"'
  if (!caption) {
    const d = root.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? root.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    const m = /:\s*["“]([\s\S]+?)["”]\.?\s*$/.exec(d);
    if (m) caption = m[1]!;
  }
  caption = caption.trim();
  if (!caption) return null;
  const comments = root.querySelectorAll('.Comment, [class*="CommentText"], .CaptionComments li').map((n) => { const c = parse(n.outerHTML); c.querySelectorAll('[class*="Username"], a').forEach((a) => a.remove()); return textOf(c); }).filter((c) => c.length > 20);
  const img = root.querySelector('img.EmbeddedMediaImage')?.getAttribute('src') ?? root.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null;
  return { caption, comments, imageUrl: img ? img.replace(/&amp;/g, '&') : null };
}

const PASTE: ImportError = { code: 'unsupported', error: 'Instagram would not show that post without a login. Paste the caption (and the comment with the recipe, if there is one) into the box below instead.' };

/** Link import: the embed page, read as above. The error always points to the paste box. */
export async function importInstagram(url: string, fetchPage: PageFetcher): Promise<ImportDraft | ImportError> {
  const code = instagramCode(url);
  if (!code) return { code: 'unsupported', error: 'That Instagram link is not a post or a reel. Open the post and copy its link, or paste the caption below.' };
  let post: PostText | null = null;
  try { post = readEmbed((await fetchPage(`https://www.instagram.com/p/${code}/embed/captioned/`)).html); }
  catch (e) { if (!(e instanceof FetchError)) throw e; }
  if (!post) return PASTE;
  return fromText([post.caption, ...post.comments], url, post.imageUrl);
}

/** Pasted text (the caption first, then any comments) read as a recipe. */
export function fromText(texts: string[], sourceUrl: string | null, imageUrl: string | null = null): ImportDraft | ImportError {
  const d = parseRecipeText(texts, { sourceUrl: sourceUrl && isInstagramUrl(sourceUrl) ? sourceUrl.split('?')[0]! : sourceUrl, sourceName: sourceUrl && !isInstagramUrl(sourceUrl) ? null : 'Instagram', imageUrl });
  if (!d) return { code: 'no-recipe', error: 'That text does not look like a recipe. A recipe needs a list of ingredients (lines that start with an amount) or numbered steps. If the creator put it in a comment, paste that too.' };
  return d;
}
