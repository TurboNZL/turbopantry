import type { DeviceSettings } from './settings.ts';

interface AndroidBridge { setServer(url: string, token: string): void; setAccess(id: string, secret: string): void }

/** Inside the Android app: tells the native side where the server is and how to pass Cloudflare Access (it adds the headers to the app's own requests). A browser has no bridge and nothing happens. */
export function syncNative(s: Pick<DeviceSettings, 'serverUrl' | 'token' | 'cfAccessId' | 'cfAccessSecret'>): void {
  const bridge = (window as unknown as { TurboPantryAndroid?: AndroidBridge }).TurboPantryAndroid;
  if (!bridge) return;
  try { bridge.setServer(s.serverUrl, s.token); bridge.setAccess(s.cfAccessId, s.cfAccessSecret); } catch { /* an old shell without these calls */ }
}
