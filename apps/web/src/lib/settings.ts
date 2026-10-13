/** Everything stored on this device. The look (theme .. wallpaper) is handed to the turbothemes engine by lib/appearance.ts. */
export interface DeviceSettings {
  theme: string;
  ui: string;
  layout: string;
  glass: 'regular' | 'clear';
  wallpaper: boolean;
  wallpaperCustom: boolean;
  wallpaperDarkness: number;
  themeUpdates: boolean;
  themesToken: string;
  /** '' = the server that served this page (the normal case); otherwise the address of another server (the Android app). */
  serverUrl: string;
  token: string;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  theme: 'auto', ui: 'auto', layout: 'side', glass: 'regular', wallpaper: false, wallpaperCustom: false, wallpaperDarkness: 0.35,
  themeUpdates: true, themesToken: '', serverUrl: '', token: '',
};

const KEY = 'turbopantry.settings';

export function loadSettings(): DeviceSettings {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DeviceSettings>) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: DeviceSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode or full: the settings just do not persist */ }
}
