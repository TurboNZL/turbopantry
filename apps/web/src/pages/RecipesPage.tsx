import { useStore } from '../lib/store.ts';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useRowMenu } from '../lib/contextMenu.tsx';
import { toast } from '../lib/toast.ts';
import { BookOpen, Clock, Link2, PenLine, Plus, ShoppingCart, Trash2, Users } from 'lucide-react';
import type { RecipeSummary } from '@turbopantry/shared';
import { LoadError } from '../components/SignInNotice.tsx';
import { useApi, useLoad } from '../lib/useApi.ts';

export function RecipeImage({ url, className = '' }: { url: string | null; className?: string }) {
  const base = useStore((s) => s.settings.serverUrl);
  return url
    ? <img src={url.startsWith('/images/') ? `${base.replace(/\/+$/, '')}${url}` : url} alt="" loading="lazy" referrerPolicy="no-referrer" className={`object-cover ${className}`} />
    : <div className={`flex items-center justify-center bg-raised text-muted ${className}`} aria-hidden><BookOpen size={28} /></div>;
}

const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

function Card({ r, onDeleted }: { r: RecipeSummary; onDeleted(): void }) {
  const nav = useNavigate();
  const api = useApi();
  const menu = useRowMenu(r.title, () => [
    { label: 'Open', icon: <BookOpen size={16} />, run: () => nav(`/recipes/${r.id}`) },
    { label: 'Edit', icon: <PenLine size={16} />, run: () => nav(`/recipes/${r.id}/edit`) },
    { label: 'Add what it needs to the list', icon: <ShoppingCart size={16} />, run: () => { void api.addFromRecipe(r.id).then((x) => toast(x.added.length ? `Added ${x.added.length} to the list` : 'You have everything for it')).catch((e: Error) => toast(e.message)); } },
    { label: 'Delete', icon: <Trash2 size={16} />, danger: true, run: () => { if (window.confirm(`Delete “${r.title}”?`)) void api.deleteRecipe(r.id).then(() => { toast('Recipe deleted'); onDeleted(); }).catch((e: Error) => toast(e.message)); } },
  ]);
  return (
    <Link to={`/recipes/${r.id}`} className="card bt-tile block overflow-hidden" {...menu}>
      <RecipeImage url={r.imageUrl} className="aspect-[4/3] w-full" />
      <div className="space-y-1 p-3">
        <div className="line-clamp-2 font-medium">{r.title}</div>
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          {r.totalMinutes !== null && <span className="inline-flex items-center gap-1"><Clock size={12} />{mins(r.totalMinutes)}</span>}
          {r.servings !== null && <span className="inline-flex items-center gap-1"><Users size={12} />{r.servings}</span>}
        </div>
      </div>
    </Link>
  );
}

export function RecipesPage() {
  const api = useApi();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { data, error, loading, reload } = useLoad(() => api.listRecipes(q), [api, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{q ? `Recipes matching “${q}”` : 'Recipes'}</h1>
        <div className="flex gap-2">
          <Link to="/recipes/import" className="btn btn-accent"><Link2 size={16} />Import from a link</Link>
          <Link to="/recipes/new" className="btn"><PenLine size={16} />Write one</Link>
        </div>
      </div>
      {error && <LoadError error={error} />}
      {loading && !data && !error && <p className="text-sm text-muted">Loading…</p>}
      {data && data.length === 0 && (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <BookOpen size={28} className="text-muted" />
          <p className="font-medium">{q ? 'Nothing matches that' : 'No recipes yet'}</p>
          {!q && <p className="max-w-md text-sm text-muted">Paste a link to a recipe on a website, or write one yourself.</p>}
          {!q && <Link to="/recipes/import" className="btn btn-accent mt-1"><Plus size={16} />Import your first recipe</Link>}
        </div>
      )}
      {data && data.length > 0 && <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{data.map((r) => <Card key={r.id} r={r} onDeleted={reload} />)}</div>}
    </div>
  );
}
