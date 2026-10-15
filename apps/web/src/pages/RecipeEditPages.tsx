import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { RecipeInput } from '@turbopantry/shared';
import { EMPTY_RECIPE, RecipeForm } from '../components/RecipeForm.tsx';
import { LoadError } from '../components/SignInNotice.tsx';
import { defaultChoices, IngredientLinker, resolveLinks, type Choices } from '../components/IngredientLinker.tsx';
import { useItems } from '../lib/data.ts';
import { ApiError } from '../lib/api.ts';
import { useApi, useLoad } from '../lib/useApi.ts';

function useSave(save: (r: RecipeInput) => Promise<{ id: number }>) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return {
    busy, error,
    submit: async (r: RecipeInput) => {
      setBusy(true); setError(null);
      try { nav(`/recipes/${(await save(r)).id}`); }
      catch (e) { setError((e as Error).message); setBusy(false); }
    },
  };
}

export function NewRecipePage() {
  const api = useApi();
  const { busy, error, submit } = useSave((r) => api.createRecipe(r));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">New recipe</h1>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <RecipeForm initial={EMPTY_RECIPE} submitLabel="Save recipe" busy={busy} onSubmit={(r) => void submit(r)} />
    </div>
  );
}

export function EditRecipePage() {
  const id = Number(useParams().id);
  const api = useApi();
  const { data, error } = useLoad(() => api.getRecipe(id), [api, id]);
  const { busy, error: saveError, submit } = useSave((r) => api.updateRecipe(id, r));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Edit recipe</h1>
      {error && <LoadError error={error} />}
      {saveError && <p className="text-sm text-bad" role="alert">{saveError}</p>}
      {data && <RecipeForm initial={data} submitLabel="Save changes" busy={busy} onSubmit={(r) => void submit(r)} />}
      <Link to={`/recipes/${id}`} className="text-sm text-muted underline">Cancel</Link>
    </div>
  );
}

const EXPLAIN: Record<string, string> = {
  unsupported: 'That kind of link cannot be imported yet.',
};

export function ImportPage() {
  const api = useApi();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeInput | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [alternative, setAlternative] = useState<{ url: string; label: string } | null>(null);
  const { items } = useItems();
  const [choices, setChoices] = useState<Choices>({});
  const { busy: saving, error: saveError, submit } = useSave(async (r) => api.createRecipe({ ...r, ingredients: await resolveLinks(api, r.ingredients, choices, items) }));

  async function fetchDraft(e?: React.FormEvent, address = url) {
    e?.preventDefault();
    setBusy(true); setError(null); setDraft(null); setWarnings([]); setAlternative(null);
    try { const d = await api.importUrl(address.trim()); setDraft(d.recipe); setChoices(defaultChoices(d.recipe.ingredients, items)); setWarnings(d.warnings); setAlternative(d.alternative ?? null); }
    catch (err) { setError(err instanceof ApiError ? (err.status === 401 ? 'Sign in first (Settings → Server).' : err.message) : EXPLAIN.unsupported!); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Import from a link</h1>
      <form onSubmit={(e) => void fetchDraft(e)} className="flex gap-2">
        <input className="input flex-1" type="url" required placeholder="https://… a recipe page or an Osta link" aria-label="Recipe address" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
        <button className="btn btn-accent" disabled={busy || !url.trim()}>{busy ? 'Reading…' : 'Import'}</button>
      </form>
      <p className="text-sm text-muted">Works with most recipe websites and Osta share links. You can check and fix everything before it is saved.</p>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      {saveError && <p className="text-sm text-bad" role="alert">{saveError}</p>}
      {draft && (
        <div className="space-y-3">
          <div className="card p-3 text-sm">Found <strong>{draft.title || 'a recipe'}</strong> with {draft.ingredients.length} ingredients and {draft.steps.length} steps. Check it, then save.</div>
          {warnings.map((w) => <p key={w} className="rounded-theme bg-warn/15 p-3 text-sm" role="status">{w}</p>)}
          {alternative && <button type="button" className="btn btn-accent" disabled={busy} onClick={() => { setUrl(alternative.url); void fetchDraft(undefined, alternative.url); }}>Import from {alternative.label} instead</button>}
          <RecipeForm initial={draft} submitLabel="Save recipe" busy={saving} onSubmit={(r) => void submit(r)}>
            {draft.ingredients.length > 0 && <IngredientLinker ingredients={draft.ingredients} items={items} choices={choices} onChange={setChoices} />}
          </RecipeForm>
        </div>
      )}
    </div>
  );
}
