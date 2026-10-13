/** ISO 8601 durations ("PT1H30M", "P0DT45M") and plain text ("45 mins", "1 hr 15 min") -> minutes, or null. */
export function parseMinutes(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(t);
  if (iso && t.length > 1) return Number(iso[1] ?? 0) * 1440 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0) + (iso[4] ? Math.round(Number(iso[4]) / 60) : 0);
  let total = 0, found = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?)\b/gi)) {
    const n = Number(m[1]), u = m[2]!.toLowerCase();
    total += u.startsWith('d') ? n * 1440 : u.startsWith('h') ? n * 60 : n; found = true;
  }
  if (found) return Math.round(total);
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** "4 servings", 4, ["4", "4 servings"], "Serves 6", "12 cookies" -> the first number, or null. */
export function parseServings(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (Array.isArray(v)) { for (const x of v) { const n = parseServings(x); if (n !== null) return n; } return null; }
  if (typeof v !== 'string') return null;
  const m = /\d+(?:\.\d+)?/.exec(v);
  const n = m ? Number(m[0]) : NaN;
  return n > 0 ? n : null;
}
