import { useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { cleanSteps, parseIngredientBlock, parseMinutes, parseServings, splitAmount, type RecipeInput } from '@turbopantry/shared';
import { useApi } from '../lib/useApi.ts';
import { toast } from '../lib/toast.ts';

export const EMPTY_RECIPE: RecipeInput = {
  title: '', description: '', imageUrl: null, sourceUrl: null, sourceName: null, servings: null, prepMinutes: null, cookMinutes: null, totalMinutes: null,
  ingredients: [], steps: [], tags: [], notes: '',
};

interface Row { key: number; heading: boolean; amount: string; name: string }
let rowKey = 0;
const rowsOf = (ings: RecipeInput['ingredients']): Row[] => {
  const out: Row[] = []; let section: string | null = null;
  for (const i of ings) {
    if (i.section !== section) { section = i.section; if (section) out.push({ key: rowKey++, heading: true, amount: '', name: section }); }
    const { amount, rest } = splitAmount(i.raw);
    out.push({ key: rowKey++, heading: false, amount, name: rest });
  }
  return out;
};
const rowsToText = (rows: Row[]) => rows.filter((r) => r.name.trim() || r.amount.trim()).map((r) => (r.heading ? `# ${r.name.trim()}` : `${r.amount.trim()} ${r.name.trim()}`.trim())).join('\n');

/** A picture from the device, shrunk to at most 1600 px (a phone photo is several MB) and sent as a JPEG. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that picture.'))), 'image/jpeg', 0.86));
}

const num = (s: string) => (s.trim() === '' ? null : parseMinutes(s));

/**
 * Edits a recipe as plain text: one ingredient per line (a line starting with # is a section heading), one step per line.
 * Ingredient lines are parsed on save, and the original wording is always kept, so nothing is lost if the parser guesses wrong.
 */
export function RecipeForm({ initial, submitLabel, busy, onSubmit, children }: { initial: RecipeInput; submitLabel: string; busy?: boolean; onSubmit(r: RecipeInput): void; /** shown just above the save button (the import review puts the pantry links here) */ children?: React.ReactNode }) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl ?? '');
  const [servings, setServings] = useState(initial.servings?.toString() ?? '');
  const [prep, setPrep] = useState(initial.prepMinutes?.toString() ?? '');
  const [cook, setCook] = useState(initial.cookMinutes?.toString() ?? '');
  const api = useApi();
  const [rows, setRows] = useState<Row[]>(() => rowsOf(initial.ingredients));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl ?? '');
  const [sourceName, setSourceName] = useState(initial.sourceName ?? '');
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const names = useRef<Record<number, HTMLInputElement | null>>({});
  const setRow = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const addRow = (after?: number, heading = false) => { const k = rowKey++; setRows((r) => { const i = after === undefined ? r.length : r.findIndex((x) => x.key === after) + 1; return [...r.slice(0, i), { key: k, heading, amount: '', name: '' }, ...r.slice(i)]; }); window.setTimeout(() => names.current[k]?.focus(), 30); };
  async function pick(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    try { setImageUrl(await api.uploadImage(await shrink(f))); } catch (e) { toast((e as Error).message || 'Could not add that picture'); }
    finally { setUploading(false); if (file.current) file.current.value = ''; }
  }
  const [steps, setSteps] = useState(initial.steps.join('\n\n'));
  const [tags, setTags] = useState(initial.tags.join(', '));
  const [notes, setNotes] = useState(initial.notes);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const prepMinutes = num(prep), cookMinutes = num(cook);
    onSubmit({
      ...initial, title: title.trim(), description: description.trim(), imageUrl: imageUrl.trim() || null,
      sourceUrl: sourceUrl.trim() || null, sourceName: sourceName.trim() || null,
      servings: servings.trim() ? parseServings(servings) : null, prepMinutes, cookMinutes,
      totalMinutes: initial.totalMinutes !== null && prepMinutes === initial.prepMinutes && cookMinutes === initial.cookMinutes ? initial.totalMinutes : null,
      // the ingredient lines are re-read from the text, so a line that is unchanged keeps its link to the pantry
      ingredients: parseIngredientBlock(rowsToText(rows)).map((ing) => { const was = initial.ingredients.find((o) => o.raw === ing.raw); return was?.itemId ? { ...ing, itemId: was.itemId } : ing; }), steps: cleanSteps(steps.split(/\n\s*\n|\r?\n/)), // pasted step numbers and headings ("1", "Directions") are dropped
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean), notes: notes.trim(),
    });
  }

  const label = 'mb-1 block text-sm font-medium';
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className={label}>Title</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} /></label>
      <label className="block"><span className={label}>Description</span><textarea className="input min-h-[4rem]" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block"><span className={label}>Servings</span><input className="input" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} /></label>
        <label className="block"><span className={label}>Prep (min)</span><input className="input" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} /></label>
        <label className="block"><span className={label}>Cook (min)</span><input className="input" inputMode="numeric" value={cook} onChange={(e) => setCook(e.target.value)} /></label>
      </div>
      <div className="space-y-2">
        <span className={label}>Photo <span className="font-normal text-muted">(optional)</span></span>
        <div className="flex items-center gap-3">
          {imageUrl ? <img src={imageUrl.startsWith('/') ? `${api.base()}${imageUrl}` : imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-theme border border-line object-cover" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-theme border border-dashed border-line text-muted"><ImagePlus size={24} aria-hidden /></div>}
          <div className="flex flex-wrap gap-2">
            <input ref={file} type="file" accept="image/*" className="sr-only" aria-label="Choose a photo from this device" onChange={(e) => void pick(e.target.files?.[0])} />
            <button type="button" className="btn flex h-11 items-center gap-1.5 px-3" disabled={uploading} onClick={() => file.current?.click()}><ImagePlus size={17} />{uploading ? 'Adding…' : imageUrl ? 'Change photo' : 'Add a photo'}</button>
            {imageUrl && <button type="button" className="btn btn-ghost flex h-11 items-center gap-1.5 px-3" onClick={() => setImageUrl('')}><X size={17} />Remove</button>}
          </div>
        </div>
        <details className="text-sm"><summary className="cursor-pointer text-muted">Or use a photo address</summary><input className="input mt-2" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" aria-label="Photo address" /></details>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={label}>Where it came from <span className="font-normal text-muted">(link, optional)</span></span><input className="input" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" /></label>
        <label className="block"><span className={label}>Source name <span className="font-normal text-muted">(optional)</span></span><input className="input" value={sourceName} onChange={(e) => setSourceName(e.target.value)} maxLength={100} placeholder="e.g. Taste.com.au" /></label>
      </div>
      <fieldset className="space-y-2"><legend className={label}>Ingredients</legend>
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-1.5">
              {r.heading
                ? <input ref={(el) => { names.current[r.key] = el; }} className="input h-11 min-w-0 flex-1 font-semibold" value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} placeholder="Group name, e.g. Sauce" aria-label="Group name" />
                : <>
                  <input className="input h-11 w-[7.5rem] shrink-0" value={r.amount} onChange={(e) => setRow(r.key, { amount: e.target.value })} placeholder="1 1/2 cups" aria-label="Quantity" enterKeyHint="next" />
                  <input ref={(el) => { names.current[r.key] = el; }} className="input h-11 min-w-0 flex-1" value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRow(r.key); } }} placeholder="Ingredient, notes" aria-label="Ingredient" enterKeyHint="next" />
                </>}
              <button type="button" className="btn btn-ghost flex h-11 w-9 shrink-0 items-center justify-center !p-0 text-muted" aria-label="Remove this line" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn flex h-11 items-center gap-1.5 px-3" onClick={() => addRow()}><Plus size={16} />Ingredient</button>
          <button type="button" className="btn flex h-11 items-center gap-1.5 px-3" onClick={() => addRow(undefined, true)}>Group heading</button>
          <button type="button" className="btn btn-ghost h-11 px-3" aria-expanded={pasteOpen} onClick={() => setPasteOpen((o) => !o)}>Paste a list</button>
        </div>
        {pasteOpen && <div className="space-y-2"><textarea className="input min-h-[8rem] font-mono text-sm" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'1 1/2 cups flour\n2 eggs\n# Sauce\n1 can tomatoes'} aria-label="Ingredient list to paste" />
          <button type="button" className="btn btn-accent h-11 px-4" disabled={!pasted.trim()} onClick={() => { setRows((r) => [...r, ...rowsOf(parseIngredientBlock(pasted))]); setPasted(''); setPasteOpen(false); }}>Add these lines</button></div>}
      </fieldset>
      <label className="block"><span className={label}>Method</span><textarea className="input min-h-[10rem]" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="One step per line or paragraph. Pasted step numbers are cleaned up for you." /></label>
      <label className="block"><span className={label}>Tags <span className="font-normal text-muted">(comma separated)</span></span><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
      <label className="block"><span className={label}>Notes</span><textarea className="input min-h-[4rem]" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {children}
      <button className="btn btn-accent h-12 w-full md:w-auto" disabled={busy || !title.trim()}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
