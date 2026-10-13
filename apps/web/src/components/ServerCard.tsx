import { useState } from 'react';
import { Section } from './Section.tsx';
import { Api } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';

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
