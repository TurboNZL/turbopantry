import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extractFromJsonLd, lenientParse } from '../src/import/jsonld.ts';
import { isOstaRecipeUrl, parseOstaPage } from '../src/import/osta.ts';
import { importFromUrl } from '../src/import/index.ts';
import { FetchError, isBlockedAddress, makeFetcher, safeFetchPage } from '../src/import/safeFetch.ts';
import { gzipSync } from 'node:zlib';
import { createBrowserRenderer, findChromium, OSTA_HOSTS } from '../src/import/browser.ts';

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
  it('drops bare step numbers and headings that some sites put in the method', () => {
    const odd = fx('recipe-plain-string.html').replace('"1. Mix the dry ingredients.\n2. Whisk in the milk and egg.\n3. Cook on a hot pan."', '"Directions\n1\nMix the dry ingredients.\n2\nWhisk in the milk and egg.\n3\nCook on a hot pan."');
    expect(odd).not.toBe(fx('recipe-plain-string.html')); // the substitution really happened
    expect(extractFromJsonLd(odd, 'https://example.com/p')!.steps).toEqual(['Mix the dry ingredients.', 'Whisk in the milk and egg.', 'Cook on a hot pan.']);
  });
  it('returns null for pages without a recipe', () => expect(extractFromJsonLd(fx('no-recipe.html'), 'https://example.com')).toBeNull());
  it('lenientParse gives up quietly on garbage', () => expect(lenientParse('{nope')).toBeUndefined());
});

describe('importFromUrl', () => {
  const page = (name: string) => ({ fetchPage: async (url: string) => ({ url, html: fx(name) }) });
  it('returns a draft for a recipe page', async () => expect(await importFromUrl('https://example.com/mac', page('recipe-yoast-graph.html'))).toHaveProperty('recipe.title', 'Honey BBQ Mac & Cheese'));
  it('says so when there is no recipe', async () => expect(await importFromUrl('https://example.com/x', page('no-recipe.html'))).toMatchObject({ code: 'no-recipe' }));
  it('passes fetch errors through as codes', async () => {
    const boom = { fetchPage: async () => { throw new FetchError('blocked', 'nope'); } };
    expect(await importFromUrl('https://example.com/x', boom)).toEqual({ code: 'blocked', error: 'nope' });
  });
  it('is honest about Instagram not being built yet', async () => {
    expect(await importFromUrl('https://www.instagram.com/p/abc/', page('recipe-yoast-graph.html'))).toMatchObject({ code: 'unsupported' });
  });
  it('warns when a website page has no method', async () => {
    expect(await importFromUrl('https://example.com/x', { fetchPage: async (url) => ({ url, html: fx('recipe-yoast-graph.html').replace(/"recipeInstructions":\[[\s\S]*?\]\}\]\}/, '"x":1}]}') }) })).toMatchObject({ warnings: [expect.stringContaining('No method')] });
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

describe('Osta share pages', () => {
  const html = fx('osta-share-page.html');
  const draft = parseOstaPage(html, 'https://ostarecipes.com/s/recipes/bKmcW83bkt1UBWs17gB2')!;
  const r = draft.recipe;

  it('reads the real saved page', () => expect(draft).toBeTruthy());
  it('title, creator, times, servings, description, photo, source', () => {
    expect(r.title).toBe('Honey Bbq Mac N Cheese');
    expect(r.sourceName).toBe('Osta (thegoldenbalance)');
    expect([r.prepMinutes, r.cookMinutes, r.totalMinutes, r.servings]).toEqual([30, 45, 75, 8]);
    expect(r.description).toBe('My favorite Mac N Cheese Recipe To Date');
    expect(r.imageUrl).toContain('/o/recipes%2FbKmcW83bkt1UBWs17gB2');
    expect(r.sourceUrl).toBe('https://ostarecipes.com/s/recipes/bKmcW83bkt1UBWs17gB2');
  });
  it('reads all 28 ingredient lines and not the "View in the Osta app" button', () => {
    expect(r.ingredients).toHaveLength(28);
    expect(r.ingredients.some((i) => /osta app/i.test(i.raw))).toBe(false);
  });
  it('keeps the section headings in order', () => {
    expect([...new Set(r.ingredients.map((i) => i.section))]).toEqual([null, 'Cheese sauce', 'For Layering', 'Chicken', 'Honey Bbq sauce']);
  });
  it('splits quantity, unit, name and note', () => {
    const by = (name: string) => r.ingredients.filter((i) => i.name === name);
    expect(by('pasta')[0]).toMatchObject({ quantity: 24, unit: 'oz', note: 'large elbow macaroni', section: null });
    expect(by('sharp cheddar')[0]).toMatchObject({ quantity: 8, quantityMax: 12, unit: 'oz', note: 'adjust based off thickness', section: 'Cheese sauce' });
    expect(by('flour')[0]).toMatchObject({ quantity: 1.5, unit: 'cup' });
    expect(by('honey')[0]).toMatchObject({ quantity: 0.25, unit: 'tbsp' });
    expect(by('chicken thighs')[0]).toMatchObject({ quantity: 2, unit: 'lb', note: 'cubed', section: 'Chicken' });
    expect(r.ingredients.find((i) => i.name === 'Salt')).toMatchObject({ quantity: null, note: 'to taste' });
    expect(r.ingredients.at(-1)).toMatchObject({ quantity: 3, section: 'Honey Bbq sauce', note: 'cut into small' }); // "3 Tosp cold butter": the author's typo is kept, not guessed at
  });
  it('says the page has no method', () => { expect(r.steps).toEqual([]); expect(draft.warnings.join(' ')).toContain('No method was found'); expect(draft.alternative).toBeUndefined(); });
  it('returns null for a page that is not a recipe (still loading, private, other site)', () => {
    expect(parseOstaPage('<html><body><p class="MuiTypography-root MuiTypography-h1">Osta</p></body></html>', 'https://ostarecipes.com/recipes/x')).toBeNull();
    expect(parseOstaPage(fx('no-recipe.html'), 'https://ostarecipes.com/recipes/x')).toBeNull();
  });
  it.each([['https://ostarecipes.com/s/recipes/bKmcW83bkt1UBWs17gB2', true], ['https://ostarecipes.com/recipes/abc', true], ['https://www.ostarecipes.com/recipes/abc/', true],
    ['https://ostarecipes.com/creators/explore', false], ['https://ostarecipes.com/', false], ['https://evilostarecipes.com/recipes/abc', false], ['https://ostarecipes.com.evil.com/recipes/abc', false]])('recognises %s -> %s', (u, ok) => expect(isOstaRecipeUrl(u)).toBe(ok));

  describe('an Osta recipe that was copied from a website', () => {
    // the saved page with a source address in its description and zero prep/cook times, like the carbonara the user imported
    const copied = html
      .replace('My favorite Mac N Cheese Recipe To Date', 'Get dinner on the table fast. https://www.taste.com.au/recipes/creamy-fettuccine-carbonara/018c6902-d4bd-43e6-8818-633f3ebb4b9b')
      .replace('Prep : 30 min', 'Prep : 0 min').replace('Cook : 45 min', 'Cook : 0 min');
    const d = parseOstaPage(copied, 'https://ostarecipes.com/recipes/x')!;
    it('lifts the address out of the description and offers it as the place to import from', () => {
      expect(d.recipe.description).toBe('Get dinner on the table fast.');
      expect(d.alternative).toEqual({ url: 'https://www.taste.com.au/recipes/creamy-fettuccine-carbonara/018c6902-d4bd-43e6-8818-633f3ebb4b9b', label: 'taste.com.au' });
      expect(d.warnings.join(' ')).toContain('came from taste.com.au');
    });
    it('treats "0 min" as not given', () => expect([d.recipe.prepMinutes, d.recipe.cookMinutes, d.recipe.totalMinutes]).toEqual([null, null, null]));
    it('does not offer an Instagram or Osta address', () => {
      expect(parseOstaPage(html.replace('My favorite Mac N Cheese Recipe To Date', 'Made it! https://www.instagram.com/reel/abc/'), 'https://ostarecipes.com/recipes/x')!.alternative).toBeUndefined();
      expect(parseOstaPage(html.replace('My favorite Mac N Cheese Recipe To Date', 'See https://ostarecipes.com/recipes/other'), 'https://ostarecipes.com/recipes/x')!.alternative).toBeUndefined();
    });
  });

  describe('through importFromUrl', () => {
    it('renders the link and returns the draft', async () => {
      const seen: string[] = [];
      const render = async (url: string) => { seen.push(url); return { url, html }; };
      const res = await importFromUrl('https://ostarecipes.com/s/recipes/bKmcW83bkt1UBWs17gB2', { render });
      expect(res).toHaveProperty('recipe.title', 'Honey Bbq Mac N Cheese');
      expect(seen).toEqual(['https://ostarecipes.com/s/recipes/bKmcW83bkt1UBWs17gB2']);
    });
    it('tries the other form of the link when the first shows nothing', async () => {
      const seen: string[] = [];
      const render = async (url: string) => { seen.push(url); return { url, html: url.includes('/s/') ? '<html></html>' : html }; };
      expect(await importFromUrl('https://ostarecipes.com/s/recipes/abc', { render })).toHaveProperty('recipe.title');
      expect(seen).toEqual(['https://ostarecipes.com/s/recipes/abc', 'https://ostarecipes.com/recipes/abc']);
    });
    it('says so when there is no browser, nothing shows, or the link is not a recipe', async () => {
      expect(await importFromUrl('https://ostarecipes.com/recipes/abc', {})).toMatchObject({ code: 'no-browser' });
      expect(await importFromUrl('https://ostarecipes.com/recipes/abc', { render: async (url) => ({ url, html: '<html></html>' }) })).toMatchObject({ code: 'no-recipe' });
      expect(await importFromUrl('https://ostarecipes.com/recipes/abc', { render: async () => { throw new FetchError('fetch-failed', 'timed out'); } })).toMatchObject({ code: 'fetch-failed' });
      expect(await importFromUrl('https://ostarecipes.com/creators/explore', { render: async (url) => ({ url, html }) })).toMatchObject({ code: 'unsupported' });
    });
    it('reports a missing browser as no-browser, not as a crash', async () => {
      expect(await importFromUrl('https://ostarecipes.com/recipes/abc', { render: async () => { throw new FetchError('no-browser', 'none'); } })).toMatchObject({ code: 'no-browser' });
    });
  });
});

// These start a real Chromium (the one on this machine); where there is none they are skipped, and CLAUDE.md says so.
// 30 s per test: a cold Chromium on a CI runner took over vitest's 5 s default (the Check runs on main failed for it).
describe.skipIf(!findChromium())('headless renderer (real Chromium, local test pages)', () => {
  const localOnly = (host: string) => host === '127.0.0.1';
  const render = createBrowserRenderer({ allowHost: localOnly, noSandbox: true });

  async function site(handler: Parameters<typeof createServer>[1]) {
    const srv = createServer(handler);
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, port: (srv.address() as AddressInfo).port, close: () => new Promise((r) => srv.close(r)) };
  }

  it('waits for a JavaScript-only page to render, then returns the finished HTML', async () => {
    const s = await site((q, res) => {
      if (q.url === '/data.json') { setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"t":"Ingredients"}'); }, 300); return; }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><div id="root"></div><script>fetch("/data.json").then(r=>r.json()).then(d=>{document.getElementById("root").innerHTML="<p>"+d.t+"</p><p>24 ozs pasta</p>"})</script></body></html>');
    });
    try { const out = await render(`${s.url}/recipes/abc`, { readyText: 'Ingredients', timeoutMs: 8000 }); expect(out.html).toContain('24 ozs pasta'); } finally { await s.close(); }
  });
  it('gives up with a clear error when the text never appears', async () => {
    const s = await site((_q, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body><p>Not found</p></body></html>'); });
    try { await expect(render(s.url, { readyText: 'Ingredients', timeoutMs: 1500 })).rejects.toMatchObject({ code: 'fetch-failed' }); } finally { await s.close(); }
  });
  it('never lets the page reach a host that is not on the allow-list', async () => {
    let evilHits = 0;
    const evil = await site((_q, res) => { evilHits++; res.writeHead(200, { 'access-control-allow-origin': '*' }); res.end('x'); });
    // "localhost" is not 127.0.0.1 by name, so the allow-list refuses it even though it is the same machine
    const s = await site((_q, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html><body><p>Ingredients</p><script>fetch("http://localhost:${evil.port}/steal").catch(()=>{}); new Image().src="http://localhost:${evil.port}/pixel"; var f=document.createElement("iframe"); f.src="http://localhost:${evil.port}/frame"; document.body.appendChild(f);</script></body></html>`); });
    try { await render(s.url, { readyText: 'Ingredients', timeoutMs: 8000 }); await new Promise((r) => setTimeout(r, 500)); expect(evilHits).toBe(0); } finally { await s.close(); await evil.close(); }
  });
  it('does not load images', async () => {
    let imageHits = 0;
    const s = await site((q, res) => {
      if (q.url === '/pic.png') { imageHits++; res.writeHead(200, { 'content-type': 'image/png' }); res.end('x'); return; }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body><p>Ingredients</p><img src="/pic.png"></body></html>');
    });
    try { const out = await render(s.url, { readyText: 'Ingredients', timeoutMs: 8000 }); await new Promise((r) => setTimeout(r, 300)); expect(imageHits).toBe(0); expect(out.html).toContain('/pic.png'); } finally { await s.close(); }
  });
  it('renders one page at a time', async () => {
    let active = 0, peak = 0;
    const s = await site((_q, res) => { active++; peak = Math.max(peak, active); setTimeout(() => { active--; res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body><p>Ingredients</p></body></html>'); }, 400); });
    try { await Promise.all([1, 2, 3].map(() => render(s.url, { readyText: 'Ingredients', timeoutMs: 8000 }))); expect(peak).toBe(1); } finally { await s.close(); }
  });
  it('says so when no browser can be started', async () => {
    const none = createBrowserRenderer({ executablePath: null });
    await expect(none('https://example.com', { readyText: 'x' })).rejects.toMatchObject({ code: 'no-browser' });
    const bad = createBrowserRenderer({ executablePath: '/nonexistent/chrome' });
    await expect(bad('https://example.com', { readyText: 'x' })).rejects.toMatchObject({ code: 'no-browser' });
  });
}, 30_000);

describe('OSTA_HOSTS allow-list', () => {
  it.each(['ostarecipes.com', 'www.ostarecipes.com', 'firestore.googleapis.com', 'firebasestorage.googleapis.com', 'www.gstatic.com'])('allows %s', (h) => expect(OSTA_HOSTS(h)).toBe(true));
  it.each(['evil.com', 'ostarecipes.com.evil.com', 'notostarecipes.com', 'localhost', '127.0.0.1', '169.254.169.254', 'googleapis.com.evil.io'])('refuses %s', (h) => expect(OSTA_HOSTS(h)).toBe(false));
});
