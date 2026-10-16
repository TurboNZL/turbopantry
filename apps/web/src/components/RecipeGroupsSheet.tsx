import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Sheet } from './Sheet.tsx';
import { toast } from '../lib/toast.ts';
import { useApi, useLoad } from '../lib/useApi.ts';
import type { RecipeGroup } from '@turbopantry/shared';

/** Which groups (collections) a recipe is in: tick them, or make a new one on the spot. */
export function RecipeGroupsSheet({ recipeId, title, current, onClose, onSaved }: { recipeId: number; title: string; current: number[]; onClose(): void; onSaved(): void }) {
  const api = useApi();
  const { data, reload } = useLoad(() => api.listRecipeGroups(), [api]);
  const [picked, setPicked] = useState<Set<number>>(new Set(current));
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<RecipeGroup[]>([]);
  useEffect(() => { if (data) setGroups(data); }, [data]);
  const flip = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try { const g = await api.createRecipeGroup(name.trim()); setName(''); setPicked((p) => new Set(p).add(g.id)); reload(); } catch (err) { toast((err as Error).message); }
  }
  async function save() { try { await api.setRecipeGroups(recipeId, [...picked]); onSaved(); onClose(); } catch (e) { toast((e as Error).message); } }
  return (
    <Sheet title={`Groups for ${title}`} onClose={onClose} footer={<button className="btn btn-accent h-12 w-full" onClick={() => void save()}>Save</button>}>
      <form className="flex gap-2" onSubmit={(e) => void add(e)}>
        <input className="input h-11 flex-1" placeholder="New group, e.g. Weeknight" aria-label="New group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <button className="btn btn-accent h-11 px-4" aria-label="Add group"><Plus size={18} /></button>
      </form>
      {groups.length === 0 && <p className="text-sm text-muted">No groups yet. Make one above, for example “Weeknight”, “Baking” or “Kids”.</p>}
      <ul className="divide-y divide-line">{groups.map((g) => (
        <li key={g.id}><label className="flex min-h-[3rem] cursor-pointer items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={picked.has(g.id)} onChange={() => flip(g.id)} /><span className="flex-1">{g.name}</span><span className="text-xs text-muted">{g.count}</span></label></li>))}</ul>
    </Sheet>
  );
}
