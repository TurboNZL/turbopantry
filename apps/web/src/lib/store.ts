import { create } from 'zustand';
import { applyAppearance } from './appearance.ts';
import { syncNative } from './native.ts';
import { loadSettings, saveSettings, type DeviceSettings } from './settings.ts';

interface State {
  settings: DeviceSettings;
  updateSettings(patch: Partial<DeviceSettings>): void;
}

export const useStore = create<State>((set, get) => ({
  settings: loadSettings(),
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    applyAppearance(settings);
    if (['serverUrl', 'token', 'cfAccessId', 'cfAccessSecret'].some((k) => k in patch)) syncNative(settings);
    set({ settings });
  },
}));
