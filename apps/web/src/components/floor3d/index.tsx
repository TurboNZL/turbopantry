import { lazy, Suspense } from 'react';
import type { Kitchen3DProps, StoreMap3DProps } from './types.ts';

export type { Kitchen3DProps, StoreMap3DProps } from './types.ts';

/**
 * The faux-3D views. These wrappers load the scene code on first use (React.lazy), so people who leave "3D views" off never download it.
 * Import from here, not from the *Impl files.
 */
const KitchenImpl = lazy(() => import('./Kitchen3DImpl.tsx').then((m) => ({ default: m.Kitchen3DImpl })));
const StoreImpl = lazy(() => import('./StoreMap3DImpl.tsx').then((m) => ({ default: m.StoreMap3DImpl })));

const Loading = () => <div className="card p-8 text-center text-sm text-muted" role="status">Loading the 3D view…</div>;

export function Kitchen3D(props: Kitchen3DProps) {
  return <Suspense fallback={<Loading />}><KitchenImpl {...props} /></Suspense>;
}

export function StoreMap3D(props: StoreMap3DProps) {
  return <Suspense fallback={<Loading />}><StoreImpl key={props.store.id} {...props} /></Suspense>;
}
