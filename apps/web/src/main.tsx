import './fonts.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { applyAppearance } from './lib/appearance.ts';
import { useStore } from './lib/store.ts';

// the look is applied before the first render, so a saved theme never flashes the default one
applyAppearance(useStore.getState().settings);

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
