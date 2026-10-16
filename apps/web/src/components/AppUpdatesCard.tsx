import { useEffect, useState } from 'react';
import { appVersion, nativeUpdates, type UpdateState } from '../lib/native.ts';
import { Section } from './Section.tsx';

const describe = (s: UpdateState): string => {
  switch (s.status) {
    case 'checking': return 'Checking for updates…';
    case 'none': return s.message ?? 'You are on the latest version.';
    case 'downloading': return `Downloading ${s.version ?? 'the update'}${s.percent != null ? ` (${s.percent}%)` : ''}…`;
    case 'ready': return s.message ?? `${s.version ?? 'The update'} is ready.`;
    case 'disabled': return s.message ?? 'Updates are not available here.';
    case 'error': return `Could not check: ${s.message ?? 'unknown error'}`;
    default: return '';
  }
};

/** Self-update of the installed Android app (the engine's AppSettings card, Android half): no command line. Hidden in a browser. */
export function AppUpdatesCard() {
  const up = nativeUpdates();
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [hasToken, setHasToken] = useState(false);
  const [token, setToken] = useState('');
  useEffect(() => {
    if (!up) return;
    let live = true;
    void up.state().then((s) => { if (live) setState(s); });
    void up.hasToken().then((h) => { if (live) setHasToken(h); });
    const off = up.onState((s) => { if (live) setState(s); });
    return () => { live = false; off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!up) return null;
  const busy = state.status === 'checking' || state.status === 'downloading';
  return (
    <Section title="App updates">
      <p className="text-sm text-muted">The app checks GitHub for a new version when it opens (at most every few hours) and downloads it in the background. Version {appVersion() ?? '?'}.</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className="btn h-11" disabled={busy} onClick={() => void up.check().then(setState)}>Check for updates</button>
        {state.status === 'ready' && <button className="btn btn-accent h-11" onClick={() => up.install()}>Install update</button>}
        <span className={state.status === 'error' ? 'text-warn' : 'text-muted'}>{describe(state)}</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Private repository? Add a GitHub token{hasToken && ' (one is saved)'}</summary>
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted">While the repository is private the app needs a fine-grained personal access token that can read its contents (repository access: only this one, Contents: read-only). It stays on this device. Not needed once the repository is public.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input h-11 w-80 max-w-full font-mono" type="password" autoComplete="off" placeholder={hasToken ? 'saved (type a new one to replace it)' : 'github_pat_…'} value={token} onChange={(e) => setToken(e.target.value)} />
            <button className="btn h-11" disabled={!token.trim()} onClick={() => void up.setToken(token).then(() => { setHasToken(true); setToken(''); return up.check(); }).then(setState)}>Save and check</button>
            {hasToken && <button className="btn btn-ghost h-11" onClick={() => void up.setToken('').then(() => setHasToken(false))}>Remove</button>}
          </div>
        </div>
      </details>
    </Section>
  );
}
