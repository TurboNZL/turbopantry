import { useState } from 'react';
import { Section } from './Section.tsx';
import { Api } from '../lib/api.ts';
import { useStore } from '../lib/store.ts';

/** Where this device signs in: the server that served the page by default, or another address (the Android app has no page origin). */
export function ServerCard() {
  const { settings, updateSettings } = useStore();
  const [url, setUrl] = useState(settings.serverUrl);
  const [token, setToken] = useState(settings.token);
  const [result, setResult] = useState<string | null>(null);

  async function test() {
    setResult('Checking…');
    const api = new Api({ serverUrl: url.trim(), token: token.trim() });
    try {
      const h = await api.health();
      try { const s = await api.status(); setResult(`Signed in as ${s.user}. Server ${h.version}.`); }
      catch (e) { setResult((e as Error).message === 'Wrong token' ? 'Server found, but the token is wrong.' : `Server found (${h.version}), but sign-in failed.`); }
    } catch { setResult('Cannot reach the server at that address.'); }
  }
  const save = () => { updateSettings({ serverUrl: url.trim(), token: token.trim() }); void test(); };

  return (
    <Section title="Server">
      <p className="text-sm text-muted">Leave the address empty to use the server that served this page. Each person has their own token; the owner makes one with <code>add-user</code> (see the Self-hosting guide).</p>
      <label className="block text-sm"><span className="mb-1 block font-medium">Server address <span className="font-normal text-muted">(optional)</span></span>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://pantry.example.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
      <label className="block text-sm"><span className="mb-1 block font-medium">Access token</span>
        <input type="password" className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="tp_…" autoComplete="off" /></label>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-accent" onClick={save}>Save and test</button>
        {result && <span className="text-sm text-muted" aria-live="polite">{result}</span>}
      </div>
    </Section>
  );
}
