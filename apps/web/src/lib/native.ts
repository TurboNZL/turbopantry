import type { DeviceSettings } from './settings.ts';

/** How far the self-update of the installed Android app has got (the engine's `updaters` module, Android half). */
export type UpdateState = { status: 'idle' | 'disabled' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'; version?: string; percent?: number; message?: string };

export interface NativeUpdates {
  state(): Promise<UpdateState>;
  check(): Promise<UpdateState>;
  /** opens Android's installer for the downloaded update */
  install(): void;
  /** a GitHub token for updates from a private repository */
  hasToken(): Promise<boolean>;
  setToken(token: string): Promise<void>;
  onState(cb: (s: UpdateState) => void): () => void;
}

/** What the Android app puts on `window` (a Java interface: strings only, so results come back as JSON and updates as events). */
interface AndroidBridge {
  setServer(url: string, token: string): void; setAccess(id: string, secret: string): void;
  version(): string; updateState(): string; checkForUpdate(): void; installUpdate(): void; hasUpdateToken(): boolean; setUpdateToken(t: string): void;
}
const android = (): AndroidBridge | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { TurboPantryAndroid?: AndroidBridge }).TurboPantryAndroid);

export const isAndroidApp = () => !!android();
export const appVersion = (): string | null => { try { return android()?.version() ?? null; } catch { return null; } };

/** The app's self-update, or null in a browser. */
export function nativeUpdates(): NativeUpdates | null {
  const a = android();
  if (!a) return null;
  const read = (): UpdateState => { try { return JSON.parse(a.updateState()) as UpdateState; } catch { return { status: 'idle' }; } };
  return {
    state: async () => read(),
    check: async () => { a.checkForUpdate(); return read(); },
    install: () => a.installUpdate(),
    hasToken: async () => { try { return a.hasUpdateToken(); } catch { return false; } },
    setToken: async (t) => { try { a.setUpdateToken(t); } catch { /* old app */ } },
    onState: (cb) => {
      const h = (e: Event) => cb((e as CustomEvent<UpdateState>).detail);
      window.addEventListener('turbopantry-update', h);
      return () => window.removeEventListener('turbopantry-update', h);
    },
  };
}

/** Inside the Android app: tells the native side where the server is and how to pass Cloudflare Access (it adds the headers to the app's own requests). A browser has no bridge and nothing happens. */
export function syncNative(s: Pick<DeviceSettings, 'serverUrl' | 'token' | 'cfAccessId' | 'cfAccessSecret'>): void {
  const bridge = android();
  if (!bridge) return;
  try { bridge.setServer(s.serverUrl, s.token); bridge.setAccess(s.cfAccessId, s.cfAccessSecret); } catch { /* an old shell without these calls */ }
}
