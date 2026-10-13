import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Clock, Link2, PenLine, Plus, Users } from 'lucide-react';
import type { RecipeSummary } from '@turbopantry/shared';
import { LoadError } from '../components/SignInNotice.tsx';
import { useApi, useLoad } from '../lib/useApi.ts';

export function RecipeImage({ url, className = '' }: { url: string | null; className?: string }) {
  return url
    ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className={`object-cover ${className}`} />
    : <div className={`flex items-center justify-center bg-raised text-muted ${className}`} aria-hidden><BookOpen size={28} /></div>;
}

const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

function Card({ r }: { r: RecipeSummary }) {
  return (
    <Link to={`/recipes/${r.id}`} className="card bt-tile block overflow-hidden">
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
  const { data, error, loading } = useLoad(() => api.listRecipes(q), [api, q]);

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
      {data && data.length > 0 && <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{data.map((r) => <Card key={r.id} r={r} />)}</div>}
    </div>
  );
}
