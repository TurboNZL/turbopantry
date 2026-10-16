import './fonts.css';
import './index.css';
import { createRoot } from 'react-dom/client';
import { applyAppearance } from './lib/appearance.ts';
import { useStore } from './lib/store.ts';
import { useItems } from './lib/data.ts';
import { useLiveConnection } from './lib/live.ts';
import { useApi } from './lib/useApi.ts';
import { Kitchen3D } from './components/floor3d/index.tsx';
applyAppearance(useStore.getState().settings);
function Page() {
  const api = useApi(); useLiveConnection();
  const { items } = useItems();
  return <div className="mx-auto max-w-3xl p-4"><h1 className="mb-3 text-xl font-bold">Pantry 3D test</h1>
    <Kitchen3D items={items} onChange={(i, q) => void api.adjustStock([{ itemId: i.id, delta: q - i.qty }])} onOut={(i) => void api.adjustStock([{ itemId: i.id, delta: -i.qty }])} onList={(i) => void api.addToList({ itemId: i.id })} /></div>;
}
createRoot(document.getElementById('root')!).render(<Page />);
