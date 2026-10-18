/** Everything stored on this device. The look (theme .. wallpaper) is handed to the turbothemes engine by lib/appearance.ts. */
export interface DeviceSettings {
  theme: string;
  ui: string;
  layout: string;
  glass: 'regular' | 'clear';
  wallpaper: boolean;
  wallpaperCustom: boolean;
  wallpaperDarkness: number;
  /** Recipes: show the amounts (in the ingredient list and inside the method). Off = names only. */
  showQuantities: boolean;
  /** Recipes: how amounts are shown. "original" as written, "metric-cups" (oz and lb become g, cups stay), "metric-grams" (and cups of flour, sugar, butter, oats become g). */
  unitMode: 'original' | 'metric-cups' | 'metric-grams';
  /** Show the faux-3D kitchen and shop maps (off = nothing 3D is even loaded). */
  view3d: boolean;
  /** Android app only, opt-in: a notification when someone else changes the shopping list. */
  listNotifications: boolean;
  /** Shopping: the shop layout the list is ordered by (null = the default order). */
  storeId: number | null;
  themeUpdates: boolean;
  themesToken: string;
  /** '' = the server that served this page (the normal case); otherwise the address of another server (the Android app). */
  serverUrl: string;
  token: string;
  /** Cloudflare Access service token (cloudflare-access module): sent on every request when the server sits behind Access. */
  cfAccessId: string;
  cfAccessSecret: string;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  theme: 'auto', ui: 'auto', layout: 'side', glass: 'regular', wallpaper: false, wallpaperCustom: false, wallpaperDarkness: 0.35,
  showQuantities: true, unitMode: 'original', storeId: null, view3d: false, listNotifications: false, themeUpdates: true, themesToken: '', serverUrl: '', token: '', cfAccessId: '', cfAccessSecret: '',
};

const KEY = 'turbopantry.settings';

export function loadSettings(): DeviceSettings {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DeviceSettings>) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: DeviceSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode or full: the settings just do not persist */ }
}
