const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', deg: '°', frac12: '½', frac14: '¼', frac34: '¾' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return m; } }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Plain text of a fragment of HTML: tags dropped, entities decoded, whitespace collapsed. Block-level breaks become newlines only when asked. */
export function htmlToText(s: string, keepBreaks = false): string {
  let t = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  if (keepBreaks) t = t.replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, '\n');
  t = decodeEntities(t.replace(/<[^>]+>/g, ''));
  return (keepBreaks ? t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n') : t.replace(/\s+/g, ' ').trim());
}

/** Every <meta> as name/property -> content (first one wins). */
export function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    const val = content ? (content[1] ?? content[2] ?? '') : '';
    if (key && val && !out.has(key)) out.set(key, decodeEntities(val));
  }
  return out;
}

export const pageTitle = (html: string) => { const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html); return m ? htmlToText(m[1]!) : ''; };

/** The contents of every <script type="application/ld+json">. */
export function ldJsonBlocks(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!.trim()).filter(Boolean);
}
