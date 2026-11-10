import { useCallback, useEffect, useState } from 'react';
import { ScanLine, Smartphone, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import { QrScanner } from './QrScanner.tsx';
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
  const [me, setMe] = useState<string | null>(null);
  const [myName, setMyName] = useState('');
  useEffect(() => { if (settings.token) new Api(settings).status().then((s) => { setMe(s.user); setMyName(s.user); }, () => setMe(null)); }, [settings.serverUrl, settings.token]); // eslint-disable-line react-hooks/exhaustive-deps
  async function rename() { try { const r = await new Api(settings).renameMe(myName.trim()); setMe(r.user); setMyName(r.user); toast('Name changed'); } catch (e) { toast((e as Error).message); } }

  async function test() {
    setResult('Checking…');
    const api = new Api({ serverUrl: url.trim(), token: token.trim(), cfAccessId: cfId.trim(), cfAccessSecret: cfSecret.trim() });
    try {
      const h = await api.health();
      try { const s = await api.status(); setResult(`Signed in as ${s.user}. Server ${h.version}.`); setMe(s.user); }
      catch (e) { setResult((e as Error).message === 'Wrong token' ? 'Server found, but the token is wrong.' : `Server found (${h.version}), but sign-in failed.`); }
    } catch (e) {
      const m = (e as Error).message;
      setResult(/^(401|403)$|Server said 40[13]/.test(m) ? 'Cloudflare Access turned the request away: check the service token (and that the Access policy action is Service Auth).' : `Cannot reach the server at that address.${cfId ? ' With Cloudflare Access in front, also check the service token and the CORS setting described above.' : ''}`);
    }
  }
  const save = () => { updateSettings({ serverUrl: url.trim().replace(/\/+$/, ''), token: token.trim(), cfAccessId: cfId.trim(), cfAccessSecret: cfSecret.trim() }); void test(); };

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
          <p className="text-muted">Only if the server is behind Cloudflare Access with a Service Auth policy. Create a service token in Zero Trust (Access › Service credentials), add it to the policy, and paste the two halves here. They are sent as <code>CF-Access-Client-Id</code> and <code>CF-Access-Client-Secret</code> on every request. Kept on this device only; this is separate from the access token above, which TurboPantry itself checks.</p>
          <label className="block"><span className="mb-1 block font-medium">Client ID</span><input className="input" value={cfId} onChange={(e) => setCfId(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} /></label>
          <label className="block"><span className="mb-1 block font-medium">Client Secret</span><input type="password" className="input" value={cfSecret} onChange={(e) => setCfSecret(e.target.value)} autoComplete="off" /></label>
          <p className="text-xs text-muted">From the web client on the server&apos;s own address nothing else is needed. From another origin (the Android app) the browser first sends a preflight request that Access must let through: in the Access application&apos;s CORS settings turn on <em>Bypass options requests to origin</em> (the app also answers preflights itself), and turn the <em>binding cookie</em> off.</p>
        </div>
      </details>
      {me && <div className="flex flex-wrap items-end gap-2 rounded-theme bg-raised p-3 text-sm"><label className="min-w-0 flex-1"><span className="mb-1 block font-medium">You are signed in as</span><input className="input h-11 w-full" value={myName} onChange={(e) => setMyName(e.target.value)} maxLength={40} aria-label="Your name" /></label>
        <button className="btn h-11" disabled={!myName.trim() || myName.trim() === me} onClick={() => void rename()}>Rename</button>
        <p className="w-full text-xs text-muted">This is only the label of your account. Rename it to anything you like; the token is what signs you in.</p></div>}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-accent" onClick={save}>Save and sign in</button>
      </div>
      {result && <div className="rounded-theme bg-raised p-3 text-sm" role="status" aria-live="polite">{result}</div>}
    </Section>
  );
}

/**
 * Pairing, the way TurboMusic does it: one "Pair a device" button opens two halves. Send this connection (the address the other device should use, a code, a QR
 * code, a link) or use a code from another device (typed, pasted, or scanned with the camera). Unlike TurboMusic's, the code carries a token made just for that
 * device, so a lost phone is removed from the list below and replaced; nobody has to remake an account.
 */
export function PairCard() {
  const { settings, updateSettings } = useStore();
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState(settings.serverUrl || (/^https?:/.test(window.location.origin) && !/^https?:\/\/localhost$/.test(window.location.origin) ? window.location.origin : ''));
  const [label, setLabel] = useState('');
  const [made, setMade] = useState<{ code: string; qr: string } | null>(null);
  const [devices, setDevices] = useState<{ id: number; label: string; createdAt: string; lastUsed: string | null }[]>([]);
  const [entered, setEntered] = useState('');
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const say = (m: string) => { setNote(m); window.setTimeout(() => setNote(null), 6000); };
  const hasAccess = !!(settings.cfAccessId && settings.cfAccessSecret);
  const load = useCallback(() => { new Api(settings).listDevices().then((d) => setDevices(Array.isArray(d) ? d : []), () => setDevices([])); }, [settings.serverUrl, settings.token, settings.cfAccessId, settings.cfAccessSecret]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && settings.token) load(); }, [open, load, settings.token]);

  async function make() {
    try {
      const { token } = await new Api(settings).pairDevice(label.trim() || 'Paired device');
      const code = encodePairCode({ url: addr.trim(), token, access: hasAccess ? { id: settings.cfAccessId, secret: settings.cfAccessSecret } : undefined });
      const qr = await QRCode.toDataURL(code, { errorCorrectionLevel: 'L', margin: 2, width: 360 });
      setMade({ code, qr }); setLabel(''); load();
    } catch (e) { say((e as Error).message); }
  }
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); say(`${what} copied.`); } catch { say('Your browser blocked copying here (it needs https or localhost). Select it by hand instead.'); } };
  function use(text: string) {
    const link = /[?&]pair=([^&\s]+)/.exec(text);
    const p = decodePairCode(link ? decodeURIComponent(link[1]!) : text);
    if (!p) { say('That is not a TurboPantry pairing code. It starts with TP1-.'); return; }
    if (!window.confirm(`Connect this device to ${p.url || 'this address'}?`)) return;
    updateSettings({ serverUrl: p.url === window.location.origin ? '' : p.url, token: p.token, cfAccessId: p.access?.id ?? '', cfAccessSecret: p.access?.secret ?? '' });
    setEntered(''); setScanning(false); say('Connected.');
  }
  return (
    <Section title="Pair a device">
      <button className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Smartphone size={15} className="mr-1.5 inline" />Pair a device</button>
      {open && (
        <div className="space-y-4 rounded-theme border border-line p-3 text-sm">
          <div className="space-y-2">
            <div className="font-medium">Send this connection to another device</div>
            {settings.token ? <>
              <label className="block space-y-1"><span>Address the other device should use</span><input className="input" placeholder="https://pantry.example.com" value={addr} onChange={(e) => { setAddr(e.target.value); setMade(null); }} autoCapitalize="off" autoCorrect="off" spellCheck={false} /></label>
              <p className="text-xs text-muted">Use the address that works from where that device will be (the tunnel address for a phone on mobile data, not a home-network one). The code holds: the address, a sign-in made just for that device{hasAccess ? ' and the Cloudflare Access service token (client ID and secret)' : ''}. {hasAccess ? '' : 'No Cloudflare Access service token is set on this device, so none is included.'}</p>
              <input className="input h-11" placeholder="Name this device, e.g. Mum's phone" aria-label="Device name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
              <button className="btn btn-accent" onClick={() => void make()}>Make a code</button>
              {made && <div className="space-y-2">
                <img src={made.qr} alt="QR code with the pairing code" className="mx-auto h-56 w-56 rounded-theme bg-white p-1" />
                <p className="text-center text-xs text-muted">On the other device: Pair a device › Scan a QR code.</p>
                <textarea readOnly className="input font-mono text-xs" rows={3} value={made.code} aria-label="Pairing code" onFocus={(e) => e.currentTarget.select()} />
                <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => void copy(made.code, 'Code')}>Copy code</button>{addr.trim() && <button className="btn" onClick={() => void copy(pairLink(addr.trim(), made.code), 'Link')}>Copy link</button>}</div>
                <p className="text-xs text-warn">The code is a password: whoever has it (or photographs the QR code) can read and change your pantry. It is shown once; send it only to yourself.</p>
              </div>}
              {devices.length > 0 && <ul className="divide-y divide-line rounded-theme border border-line">{devices.map((d) => (
                <li key={d.id} className="flex min-h-[3rem] items-center justify-between gap-2 px-3"><span className="min-w-0"><span className="block truncate font-medium">{d.label || 'Paired device'}</span><span className="block text-xs text-muted">{d.lastUsed ? `Last used ${new Date(d.lastUsed).toLocaleDateString()}` : 'Not used yet'}</span></span>
                  <button className="btn btn-ghost flex h-10 w-10 items-center justify-center !p-0" aria-label={`Remove ${d.label || 'device'}`} onClick={() => void new Api(settings).revokeDevice(d.id).then(load).catch((e: Error) => say(e.message))}><Trash2 size={16} /></button></li>))}</ul>}
            </> : <p className="text-muted">Sign in on this device first (above), then you can pair others from here.</p>}
          </div>
          <div className="space-y-2 border-t border-line pt-3">
            <div className="font-medium">Use a code from another device</div>
            {scanning ? <QrScanner onResult={use} onCancel={() => setScanning(false)} /> : <>
              <div className="flex gap-2"><input className="input font-mono" placeholder="TP1-…" aria-label="Pairing code to use" value={entered} onChange={(e) => setEntered(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && use(entered)} autoCapitalize="off" autoCorrect="off" spellCheck={false} /><button className="btn shrink-0" disabled={!entered.trim()} onClick={() => use(entered)}>Connect</button></div>
              <button className="btn flex h-11 items-center gap-1.5 px-3" onClick={() => setScanning(true)}><ScanLine size={17} />Scan a QR code</button>
            </>}
          </div>
          <details><summary className="cursor-pointer font-medium">Lost every token?</summary>
            <p className="mt-2 text-muted">On the server, run <code>node --experimental-strip-types src/index.ts new-token &lt;name&gt;</code> from <code>packages/server</code> (with the same <code>TURBOPANTRY_DATA</code> as the service). It prints a new token for that account and keeps all its data.</p></details>
        </div>)}
      {note && <div className="text-muted" role="status">{note}</div>}
    </Section>
  );
}
