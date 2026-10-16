import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, LogOut } from 'lucide-react';
import { InstagramLive } from './InstagramLive.tsx';
import { Section } from './Section.tsx';
import { useApi } from '../lib/useApi.ts';
import { useStore } from '../lib/store.ts';
import { toast } from '../lib/toast.ts';

type Status = { loggedIn: boolean; username?: string; since?: string };

/**
 * Owner only (the server answers 403 to everyone else, and then this card is simply not shown): lets the server read Instagram posts as a spare
 * ("dummy") account. The password goes to the server once, is typed into Instagram's login page by a hidden browser and is never stored: only the
 * resulting session is kept on the server. UNVERIFIED against the real Instagram (see server/src/import/instagram-session.ts).
 */
export function InstagramCard() {
  const api = useApi();
  const configured = useStore((s) => !!s.settings.token || !s.settings.serverUrl);
  const [status, setStatus] = useState<Status | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState<'sms' | 'app' | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(() => { api.instagramStatus().then((s) => alive.current && setStatus(s), () => alive.current && setStatus(null)); }, [api]);
  useEffect(() => { if (configured) load(); }, [configured, load]);

  if (!configured || !status) return null; // not the owner, no Instagram support on this server, or not signed in

  async function logIn(e: FormEvent) {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true); setError(null);
    const pw = password;
    setPassword(''); // gone from the page as soon as it is sent
    try {
      const r = await api.instagramLogin(username.trim(), pw);
      if ('needsCode' in r) { setNeedsCode(r.kind); setCode(''); }
      else { setUsername(''); toast('Logged in to Instagram'); load(); }
    } catch (err) { setError((err as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.instagramCode(code.trim());
      setNeedsCode(null); setCode(''); setUsername(''); toast('Logged in to Instagram'); load();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      if (/log in again|no login/i.test(msg)) { setNeedsCode(null); setCode(''); }
    } finally { if (alive.current) setBusy(false); }
  }
  async function logOut() {
    if (!window.confirm('Log out of Instagram? Imports from Instagram links go back to the paste box until you log in again.')) return;
    setBusy(true); setError(null);
    try { await api.instagramLogout(); setNeedsCode(null); load(); toast('Logged out of Instagram'); }
    catch (err) { setError((err as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }

  return (
    <Section title="Instagram">
      <p className="text-sm text-muted">Instagram usually hides posts from people who are not logged in. Log TurboPantry in to a <strong>spare Instagram account</strong> and it can read the caption and comments of the posts you import, where creators often put the recipe.</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li><strong>Use a dummy account, never your own.</strong> Instagram’s terms discourage automated access, so this account may get restricted or asked to confirm itself.</li>
        <li>The best way to log in is Instagram’s own page, shown live from your server: you type the password into Instagram, not into TurboPantry. Or use the username and password form below. Either way the password is <strong>never stored</strong>. Only the login session is kept, on your server, readable only by the server’s user.</li>
        <li>TurboPantry reads only a few posts a minute, and only when you import one.</li>
      </ul>

      {status.loggedIn && !needsCode ? (
        <div className="space-y-3">
          <p className="text-sm" role="status">Logged in as <strong>{status.username}</strong>{status.since ? <span className="text-muted"> since {new Date(status.since).toLocaleDateString()}</span> : null}. If Instagram signs it out, imports will say so and ask you to log in again.</p>
          <button className="btn h-11" disabled={busy} onClick={() => void logOut()}><LogOut size={16} className="mr-1.5 inline" />Log out</button>
        </div>
      ) : needsCode ? (
        <form className="space-y-3" onSubmit={(e) => void sendCode(e)}>
          <p className="text-sm">{needsCode === 'sms' ? 'Instagram sent a code by text message to the dummy account’s phone.' : 'Open the authentication app of the dummy account and read its 6-digit code.'} Type it here.</p>
          <input className="input h-11 w-full text-center text-lg tracking-widest" inputMode="numeric" autoComplete="one-time-code" aria-label="Security code" placeholder="123456" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} disabled={busy} />
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-accent h-11 min-w-[8rem]" type="submit" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Send code'}</button>
            <button className="btn h-11" type="button" disabled={busy} onClick={() => { void api.instagramLogout().catch(() => null); setNeedsCode(null); setError(null); }}>Cancel</button>
          </div>
        </form>
      ) : liveOpen ? (
        <InstagramLive onLoggedIn={() => { setLiveOpen(false); toast('Logged in to Instagram'); load(); }} onClose={() => { setLiveOpen(false); load(); }} />
      ) : (
        <div className="space-y-3">
        <button className="btn btn-accent h-11 w-full sm:w-auto" type="button" onClick={() => { setError(null); setLiveOpen(true); }}><ExternalLink size={16} className="mr-1.5 inline" />Log in on Instagram’s own page</button>
        <details className="rounded-lg border border-line p-3">
        <summary className="min-h-[44px] cursor-pointer py-2.5 text-sm font-medium">Use a username and password instead</summary>
        <form className="space-y-3 pt-2" onSubmit={(e) => void logIn(e)} autoComplete="off">
          <label className="block space-y-1 text-sm"><span className="font-medium">Username of the dummy account</span>
            <input className="input h-11 w-full" name="ig-user" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy} /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Password</span>
            <input className="input h-11 w-full" type="password" name="ig-pass" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /></label>
          <button className="btn btn-accent h-11 w-full sm:w-auto sm:min-w-[10rem]" type="submit" disabled={busy || !username.trim() || !password}>{busy ? 'Logging in…' : 'Log in'}</button>
          {busy && <p className="text-xs text-muted" role="status">A hidden browser on the server is logging in. This can take up to half a minute.</p>}
        </form>
        </details>
        </div>
      )}
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
    </Section>
  );
}
