import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import { isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

/**
 * Fetching a page for the user is the one place this server makes requests to addresses a stranger chose, so it is the one place that must
 * not be turned against the machine's own network (SSRF). Rules: http(s) only; every address a name resolves to is checked AT CONNECT TIME
 * (so a DNS answer that changes between check and connect cannot sneak through); loopback, private, link-local, CGNAT and metadata
 * addresses are refused; redirects are followed by hand and each hop is checked again; time and size are capped.
 */
export class FetchError extends Error {
  code: 'bad-url' | 'blocked' | 'fetch-failed' | 'not-html';
  constructor(code: FetchError['code'], message: string) { super(message); this.code = code; }
}

export interface Page { url: string; html: string }
export type PageFetcher = (url: string) => Promise<Page>;

const MAX_BYTES = 5 * 1024 * 1024, MAX_REDIRECTS = 5, TIMEOUT_MS = 15_000;

/** True for any address that is not a normal public internet address. */
export function isBlockedAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (isIP(v) === 6) {
    if (v === '::' || v === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isBlockedAddress(mapped[1]!);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
    if (hex) { const a = parseInt(hex[1]!, 16), b = parseInt(hex[2]!, 16); return isBlockedAddress(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`); }
    return /^(fc|fd)/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('2001:db8') || v.startsWith('64:ff9b');
  }
  const p = v.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    || (a === 169 && b === 254)           // link-local, cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 192 && b === 0 && p[2] === 0) || (a === 192 && b === 0 && p[2] === 2)
    || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && p[2] === 100) || (a === 203 && b === 0 && p[2] === 113);
}

/** dns.lookup that refuses to hand back a blocked address. Used as the connection's `lookup`, so the check and the connect see the same answer. */
const safeLookup: typeof dnsLookup = ((host: string, opts: unknown, cb: unknown) => {
  const callback = (typeof opts === 'function' ? opts : cb) as (err: Error | null, address?: string | { address: string; family: number }[], family?: number) => void;
  const options = (typeof opts === 'object' && opts ? opts : {}) as { all?: boolean };
  dnsLookup(host, { all: true }, (err, addrs) => {
    if (err) return callback(err);
    const ok = addrs.filter((a) => !isBlockedAddress(a.address));
    if (!ok.length || ok.length !== addrs.length) return callback(new FetchError('blocked', 'That address is not a public website.'));
    if (options.all) return callback(null, ok);
    callback(null, ok[0]!.address, ok[0]!.family);
  });
}) as typeof dnsLookup;

function parse(raw: string, allowPrivate = false): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new FetchError('bad-url', 'That is not a valid web address.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new FetchError('bad-url', 'Only http and https addresses can be imported.');
  if (u.username || u.password) throw new FetchError('bad-url', 'Addresses with a user name or password are not accepted.');
  if (allowPrivate) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isBlockedAddress(host)) throw new FetchError('blocked', 'That address is not a public website.');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new FetchError('blocked', 'That address is not a public website.');
  return u;
}

function once(u: URL, allowPrivate: boolean): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? httpsRequest : httpRequest)(u, {
      method: 'GET', ...(allowPrivate ? {} : { lookup: safeLookup }), timeout: TIMEOUT_MS,
      headers: {
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0 TurboPantry',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'en;q=0.9', 'accept-encoding': 'gzip, deflate, br',
      },
    }, resolve);
    req.on('timeout', () => req.destroy(new FetchError('fetch-failed', 'The website took too long to answer.')));
    req.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError('fetch-failed', 'Could not reach that website.')));
    req.end();
  });
}

async function readBody(res: IncomingMessage): Promise<string> {
  const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
  const stream = enc === 'gzip' ? res.pipe(createGunzip()) : enc === 'deflate' ? res.pipe(createInflate()) : enc === 'br' ? res.pipe(createBrotliDecompress()) : res;
  const chunks: Buffer[] = []; let size = 0;
  try {
    for await (const c of stream as AsyncIterable<Buffer>) {
      size += c.length;
      if (size > MAX_BYTES) { res.destroy(); throw new FetchError('fetch-failed', 'That page is too large to import.'); }
      chunks.push(c);
    }
  } catch (e) { throw e instanceof FetchError ? e : new FetchError('fetch-failed', 'The page could not be read.'); }
  const buf = Buffer.concat(chunks);
  const charset = /charset=["']?([\w-]+)/i.exec(String(res.headers['content-type'] ?? ''))?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1'))?.[1] ?? 'utf-8';
  try { return new TextDecoder(charset).decode(buf); } catch { return buf.toString('utf8'); }
}

/** `allowPrivate` exists only so the tests can talk to a server on the loopback address. Nothing in the app (or its configuration) sets it. */
export const makeFetcher = (allowPrivate = false): PageFetcher => async (raw) => {
  let u = parse(raw, allowPrivate);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await once(u, allowPrivate);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      try { u = parse(new URL(res.headers.location, u).toString(), allowPrivate); } catch (e) { throw e instanceof FetchError ? e : new FetchError('bad-url', 'The website redirected somewhere invalid.'); }
      continue;
    }
    if (status < 200 || status >= 300) { res.resume(); throw new FetchError('fetch-failed', status === 403 || status === 401 ? 'The website refused the request (it may block automated access).' : `The website answered ${status}.`); }
    const type = String(res.headers['content-type'] ?? '');
    if (type && !/html|xml/i.test(type)) { res.resume(); throw new FetchError('not-html', 'That address is not a web page.'); }
    return { url: u.toString(), html: await readBody(res) };
  }
  throw new FetchError('fetch-failed', 'The website redirected too many times.');
};

export const safeFetchPage: PageFetcher = makeFetcher(false);
