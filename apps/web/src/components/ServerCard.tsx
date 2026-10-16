import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { Section } from './Section.tsx';
import { Api } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';
import { decodePairCode, encodePairCode, pairLink } from '../lib/pairCode.ts';
import { toast } from '../lib/toast.ts';

/** Where this device signs in: the server that served the page by default, or another address (the Android app has no page origin). */
export function ServerCard() {
  const { settings, updateSettings } = useStore();
  const [url, setUrl] = useState(settings.serverUrl);
  const [token, setToken] = useState(settings.token);
  const [cfId, setCfId] = useState(settings.cfAccessId);
  const [cfSecret, setCfSecret] = useState(settings.cfAccessSecret);
  const [result, setResult] = useState<string | null>(null);

  async function test() {
    setResult('Checking…');
    const api = new Api({ serverUrl: url.trim(), token: token.trim(), cfAccessId: cfId.trim(), cfAccessSecret: cfSecret.trim() });
    try {
      const h = await api.health();
      try { const s = await api.status(); setResult(`Signed in as ${s.user}. Server ${h.version}.`); }
      catch (e) { setResult((e as Error).message === 'Wrong token' ? 'Server found, but the token is wrong.' : `Server found (${h.version}), but sign-in failed.`); }
    } catch { setResult(`Cannot reach the server at that address.${cfId ? ' With Cloudflare Access in front, also check the service token.' : ''}`); }
  }
  const save = () => { updateSettings({ serverUrl: url.trim(), token: token.trim(), cfAccessId: cfId.trim(), cfAccessSecret: cfSecret.trim() }); void test(); };

  return (
    <Section title="Server">
      <p className="text-sm text-muted">Leave the address empty to use the server that served this page. Each person has their own token; the owner makes one with <code>add-user</code> (see the Self-hosting guide).</p>
      <label className="block text-sm"><span className="mb-1 block font-medium">Server address <span className="font-normal text-muted">(optional)</span></span>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://pantry.example.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
      <label className="block text-sm"><span className="mb-1 block font-medium">Access token</span>
        <input type="password" className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="tp_…" autoComplete="off" /></label>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Cloudflare Access <span className="font-normal text-muted">(only if the server sits behind it)</span></summary>
        <div className="mt-2 space-y-3">
          <p className="text-muted">A service token lets this device pass Cloudflare Access without a login page. Use the token's Client ID and Client Secret. Kept on this device only.</p>
          <label className="block"><span className="mb-1 block font-medium">Client ID</span><input className="input" value={cfId} onChange={(e) => setCfId(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} /></label>
          <label className="block"><span className="mb-1 block font-medium">Client Secret</span><input type="password" className="input" value={cfSecret} onChange={(e) => setCfSecret(e.target.value)} autoComplete="off" /></label>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-accent" onClick={save}>Save and test</button>
        {result && <span className="text-sm text-muted" aria-live="polite">{result}</span>}
      </div>
    </Section>
  );
}

/**
 * Pairing: a code that signs another phone or computer in (address, a token made just for that device, and the Cloudflare Access service token if one
 * is set). Because every device gets its own token, a lost one is simply revoked here and replaced: nobody has to remake an account.
 */
export function PairCard() {
  const { settings, updateSettings } = useStore();
  const api = new Api(settings);
  const [label, setLabel] = useState('');
  const [made, setMade] = useState<{ code: string; link: string } | null>(null);
  const [devices, setDevices] = useState<{ id: number; label: string; createdAt: string; lastUsed: string | null }[]>([]);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { new Api(settings).listDevices().then(setDevices, () => setDevices([])); }, [settings.serverUrl, settings.token, settings.cfAccessId, settings.cfAccessSecret]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (settings.token) load(); }, [load, settings.token]);

  async function make() {
    setError(null);
    try {
      const { token } = await api.pairDevice(label.trim() || 'Paired device');
      const url = settings.serverUrl || window.location.origin; // a phone needs the real (tunnel) address, not localhost
      const code = encodePairCode({ url, token, access: settings.cfAccessId && settings.cfAccessSecret ? { id: settings.cfAccessId, secret: settings.cfAccessSecret } : undefined });
      setMade({ code, link: pairLink(url, code) }); setLabel(''); load();
    } catch (e) { setError((e as Error).message); }
  }
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Select the text and copy it'); } };
  function use() {
    const p = decodePairCode(paste);
    if (!p) { setError('That is not a TurboPantry pairing code.'); return; }
    updateSettings({ serverUrl: p.url === window.location.origin ? '' : p.url, token: p.token, cfAccessId: p.access?.id ?? '', cfAccessSecret: p.access?.secret ?? '' });
    setPaste(''); setError(null); toast('This device is paired');
  }
  return (
    <Section title="Pair a device">
      <p className="text-sm text-muted">Sign another phone or computer in with one code. <strong>The code is a password:</strong> anyone who has it can see and change your pantry, so only send it to yourself. Each device gets its own sign-in, so if one is lost, remove it below and pair a new one.</p>
      {settings.token ? <>
        <div className="flex flex-wrap gap-2">
          <input className="input h-11 min-w-0 flex-1" placeholder="Name this device, e.g. Mum's phone" aria-label="Device name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
          <button className="btn btn-accent h-11" onClick={() => void make()}><KeyRound size={16} className="mr-1.5 inline" />Make a code</button>
        </div>
        {made && <div className="space-y-2 rounded-theme border border-line p-3">
          <textarea readOnly className="input h-24 w-full font-mono text-xs" value={made.code} aria-label="Pairing code" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => void copy(made.code)}><Copy size={14} className="mr-1.5 inline" />Copy the code</button><button className="btn" onClick={() => void copy(made.link)}><Copy size={14} className="mr-1.5 inline" />Copy a link</button></div>
          <p className="text-xs text-muted">On the other device: open the link, or paste the code under “Use a code” in Settings → Server. It is shown once; make another if you lose it.</p>
        </div>}
        {devices.length > 0 && <ul className="divide-y divide-line rounded-theme border border-line">{devices.map((d) => (
          <li key={d.id} className="flex min-h-[3rem] items-center justify-between gap-2 px-3"><span className="min-w-0"><span className="block truncate font-medium">{d.label || 'Paired device'}</span><span className="block text-xs text-muted">{d.lastUsed ? `Last used ${new Date(d.lastUsed).toLocaleDateString()}` : 'Not used yet'}</span></span>
            <button className="btn btn-ghost flex h-10 w-10 items-center justify-center !p-0" aria-label={`Remove ${d.label || 'device'}`} onClick={() => void api.revokeDevice(d.id).then(load).catch((e: Error) => setError(e.message))}><Trash2 size={16} /></button></li>))}</ul>}
      </> : <p className="text-sm text-muted">Sign in on this device first (above), then you can pair others from here.</p>}
      <details className="text-sm"><summary className="cursor-pointer font-medium">Use a code on this device</summary>
        <div className="mt-2 flex flex-wrap gap-2"><input className="input h-11 min-w-0 flex-1" placeholder="TP1-…" aria-label="Pairing code to use" value={paste} onChange={(e) => setPaste(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} /><button className="btn h-11" disabled={!paste.trim()} onClick={use}>Use it</button></div></details>
      <details className="text-sm"><summary className="cursor-pointer font-medium">Lost every token?</summary>
        <p className="mt-2 text-muted">On the server, run <code>node --experimental-strip-types src/index.ts new-token &lt;name&gt;</code> from <code>packages/server</code> (with the same <code>TURBOPANTRY_DATA</code> as the service). It prints a new token for that account and keeps all its data.</p></details>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
    </Section>
  );
}
