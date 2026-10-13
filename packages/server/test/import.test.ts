import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extractFromJsonLd, lenientParse } from '../src/import/jsonld.ts';
import { importFromUrl } from '../src/import/index.ts';
import { FetchError, isBlockedAddress, makeFetcher, safeFetchPage } from '../src/import/safeFetch.ts';
import { gzipSync } from 'node:zlib';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

describe('JSON-LD extraction', () => {
  const r = extractFromJsonLd(fx('recipe-yoast-graph.html'), 'https://example.com/mac')!;
  it('finds the Recipe inside an @graph', () => expect(r).toBeTruthy());
  it('decodes entities and strips tags', () => { expect(r.title).toBe('Honey BBQ Mac & Cheese'); expect(r.description).toBe('A big pan of comfort.'); });
  it('maps times, servings, tags, image and source', () => {
    expect([r.prepMinutes, r.cookMinutes, r.totalMinutes, r.servings]).toEqual([30, 75, 105, 8]);
    expect(r.tags).toEqual(['dinner', 'american', 'mac and cheese', 'comfort food']);
    expect(r.imageUrl).toBe('https://cdn.example.com/mac-1x1.jpg');
    expect(r.sourceName).toBe('Example Kitchen');
    expect(r.sourceUrl).toBe('https://example.com/mac');
  });
  it('parses ingredients into quantity, unit, name and note', () => {
    const by = Object.fromEntries(r.ingredients.map((i) => [i.name, i]));
    expect(by['large elbow macaroni']).toMatchObject({ quantity: 24, unit: 'oz' });
    expect(by['sharp cheddar']).toMatchObject({ quantity: 8, unit: 'oz', note: 'grated' });
    expect(by['chicken thighs']).toMatchObject({ quantity: 2, unit: 'lb', note: 'cubed' });
    expect(by['Salt to taste']).toMatchObject({ quantity: null });
    expect(r.ingredients.at(-1)).toMatchObject({ quantity: 0.5, unit: 'cup', name: 'ketchup' }); // "1&#x2F;2" decoded first
  });
  it('flattens HowToSection steps in order', () => expect(r.steps).toEqual(['Boil the pasta until al dente.', 'Drain well.', 'Melt the butter & whisk in the milk.']));

  it('handles a type list, a bare string of steps, an ImageObject, a relative image, a trailing comma and raw newlines', () => {
    const p = extractFromJsonLd(fx('recipe-plain-string.html'), 'https://example.com/p/pancakes')!;
    expect(p.title).toBe('Fluffy Pancakes');
    expect(p.servings).toBe(4);
    expect(p.imageUrl).toBe('https://example.com/img/pancakes.jpg');
    expect(p.steps).toEqual(['Mix the dry ingredients.', 'Whisk in the milk and egg.', 'Cook on a hot pan.']);
    expect(p.ingredients.map((i) => [i.section, i.name])).toEqual([[null, 'flour'], [null, 'baking powder'], ['Wet ingredients', 'milk'], ['Wet ingredients', 'egg']]);
  });
  it('returns null for pages without a recipe', () => expect(extractFromJsonLd(fx('no-recipe.html'), 'https://example.com')).toBeNull());
  it('lenientParse gives up quietly on garbage', () => expect(lenientParse('{nope')).toBeUndefined());
});

describe('importFromUrl', () => {
  const page = (name: string) => async (url: string) => ({ url, html: fx(name) });
  it('returns a draft for a recipe page', async () => expect(await importFromUrl('https://example.com/mac', page('recipe-yoast-graph.html'))).toHaveProperty('recipe.title', 'Honey BBQ Mac & Cheese'));
  it('says so when there is no recipe', async () => expect(await importFromUrl('https://example.com/x', page('no-recipe.html'))).toMatchObject({ code: 'no-recipe' }));
  it('passes fetch errors through as codes', async () => {
    const boom = async () => { throw new FetchError('blocked', 'nope'); };
    expect(await importFromUrl('https://example.com/x', boom)).toEqual({ code: 'blocked', error: 'nope' });
  });
  it('is honest about Instagram and Osta not being built yet', async () => {
    expect(await importFromUrl('https://www.instagram.com/p/abc/', page('recipe-yoast-graph.html'))).toMatchObject({ code: 'unsupported' });
    expect(await importFromUrl('https://ostarecipes.com/s/recipes/abc', page('recipe-yoast-graph.html'))).toMatchObject({ code: 'unsupported' });
  });
});

describe('safeFetchPage (SSRF guard)', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'not-an-ip'])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111'])('allows %s', (ip) => expect(isBlockedAddress(ip)).toBe(false));

  it.each([
    ['ftp://example.com/x', 'bad-url'], ['not a url', 'bad-url'], ['file:///etc/passwd', 'bad-url'], ['https://user:pw@example.com/', 'bad-url'],
    ['http://localhost/x', 'blocked'], ['http://127.0.0.1/x', 'blocked'], ['http://[::1]/x', 'blocked'], ['http://169.254.169.254/latest/meta-data', 'blocked'],
    ['http://printer.local/', 'blocked'], ['http://0x7f.1/', 'blocked'],
  ])('refuses %s', async (url, code) => { await expect(safeFetchPage(url)).rejects.toMatchObject({ code }); });

  it('never reaches a server on the loopback address', async () => {
    let hit = false;
    const srv = createServer((_q, s) => { hit = true; s.end('<html>secret</html>'); });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    try { await expect(safeFetchPage(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/`)).rejects.toMatchObject({ code: 'blocked' }); }
    finally { await new Promise((r) => srv.close(r)); }
    expect(hit).toBe(false);
  });
});

describe('fetching (against a local server, guard off)', () => {
  const open = async (handler: Parameters<typeof createServer>[1]) => {
    const srv = createServer(handler);
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => new Promise((r) => srv.close(r)) };
  };
  const fetcher = makeFetcher(true);

  it('reads gzip and honours the charset', async () => {
    const html = '<html><body>Crème brûlée</body></html>';
    const s = await open((_q, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=iso-8859-1', 'content-encoding': 'gzip' }); res.end(gzipSync(Buffer.from(html, 'latin1'))); });
    try { expect((await fetcher(s.url)).html).toBe(html); } finally { await s.close(); }
  });
  it('follows redirects and reports the final address', async () => {
    const s = await open((q, res) => { if (q.url === '/a') { res.writeHead(302, { location: '/b' }); res.end(); } else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('ok'); } });
    try { const p = await fetcher(`${s.url}/a`); expect([p.html, p.url]).toEqual(['ok', `${s.url}/b`]); } finally { await s.close(); }
  });
  it('stops redirect loops', async () => {
    const s = await open((_q, res) => { res.writeHead(302, { location: '/' }); res.end(); });
    try { await expect(fetcher(s.url)).rejects.toMatchObject({ code: 'fetch-failed' }); } finally { await s.close(); }
  });
  it('refuses non-HTML, errors and oversized pages', async () => {
    const s = await open((q, res) => {
      if (q.url === '/img') { res.writeHead(200, { 'content-type': 'image/png' }); res.end('x'); }
      else if (q.url === '/403') { res.writeHead(403); res.end(); }
      else { res.writeHead(200, { 'content-type': 'text/html' }); res.end(Buffer.alloc(6 * 1024 * 1024, 97)); }
    });
    try {
      await expect(fetcher(`${s.url}/img`)).rejects.toMatchObject({ code: 'not-html' });
      await expect(fetcher(`${s.url}/403`)).rejects.toMatchObject({ code: 'fetch-failed', message: expect.stringContaining('refused') });
      await expect(fetcher(`${s.url}/big`)).rejects.toMatchObject({ code: 'fetch-failed', message: expect.stringContaining('too large') });
    } finally { await s.close(); }
  });
});
