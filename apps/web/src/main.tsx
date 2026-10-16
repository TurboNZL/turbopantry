import './fonts.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { applyAppearance } from './lib/appearance.ts';
import { useStore } from './lib/store.ts';
import { syncNative } from './lib/native.ts';
import { pairFromSearch } from './lib/pairCode.ts';

// the look is applied before the first render, so a saved theme never flashes the default one
applyAppearance(useStore.getState().settings);
syncNative(useStore.getState().settings);

// a pairing link (?pair=TP1-...) signs this device in after asking, then the code is removed from the address bar
const pair = pairFromSearch(window.location.search);
if (pair) {
  if (window.confirm('Sign this device in to TurboPantry with the pairing link?')) useStore.getState().updateSettings({ serverUrl: pair.url === window.location.origin ? '' : pair.url, token: pair.token, cfAccessId: pair.access?.id ?? '', cfAccessSecret: pair.access?.secret ?? '' });
  window.history.replaceState(null, '', window.location.pathname);
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
