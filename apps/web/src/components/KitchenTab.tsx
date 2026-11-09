import { Sofa } from 'lucide-react';
import { starterKitchen } from '@turbopantry/shared';
import { useLayout } from '../lib/useLayout.ts';
import { LayoutEditor } from './floor3d/LayoutEditor.tsx';
import { useCamera } from './floor3d/camera.ts';
import { toast } from '../lib/toast.ts';

/** Settings > Kitchen: build the 3D plan of your kitchen (blocks and walls). The Pantry page's 3D kitchen only looks around it; changing it happens here. */
export function KitchenTab() {
  const { layout, loaded, save } = useLayout('pantry');
  const cam = useCamera();
  if (!loaded) return <p className="text-sm text-muted" role="status">Loading the kitchen…</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Put your fridge, freezer and cupboards on a little 3D floor plan, with walls if you want rooms. Name a block and it becomes a place things can be kept in. On the Pantry page, press “3D kitchen” to look around it. The plan is shared with the household.</p>
      {!layout.blocks.length && <div className="card space-y-3 p-5 text-center"><Sofa size={30} className="mx-auto text-muted" aria-hidden /><button className="btn btn-accent h-11 px-4" onClick={() => void save(starterKitchen())}>Start with a simple kitchen</button><p className="text-xs text-muted">or add blocks yourself below</p></div>}
      <LayoutEditor key={layout.blocks.length ? 'plan' : 'empty'} kind="pantry" layout={layout} cam={cam} onSave={(l) => void save(l)} onDone={() => toast('Kitchen saved')} />
    </div>
  );
}
