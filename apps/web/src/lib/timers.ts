import { create } from 'zustand';
import { toast } from './toast.ts';

export interface Timer { id: number; label: string; total: number; /** when it rings (ms since 1970); null while paused */ endsAt: number | null; /** what is left while paused (seconds) */ left: number; rang: boolean }
interface State { timers: Timer[]; start(label: string, seconds: number): void; pause(id: number): void; resume(id: number): void; remove(id: number): void; add(id: number, seconds: number): void; ring(id: number): void }

let next = 1;
export const useTimers = create<State>((set) => ({
  timers: [],
  start: (label, seconds) => set((s) => ({ timers: [...s.timers, { id: next++, label, total: seconds, endsAt: Date.now() + seconds * 1000, left: seconds, rang: false }] })),
  pause: (id) => set((s) => ({ timers: s.timers.map((t) => (t.id === id && t.endsAt ? { ...t, left: Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000)), endsAt: null } : t)) })),
  resume: (id) => set((s) => ({ timers: s.timers.map((t) => (t.id === id && !t.endsAt ? { ...t, endsAt: Date.now() + t.left * 1000 } : t)) })),
  remove: (id) => set((s) => ({ timers: s.timers.filter((t) => t.id !== id) })),
  add: (id, seconds) => set((s) => ({ timers: s.timers.map((t) => (t.id === id ? { ...t, total: t.total + seconds, rang: false, ...(t.endsAt ? { endsAt: t.endsAt + seconds * 1000 } : { left: t.left + seconds }) } : t)) })),
  ring: (id) => set((s) => ({ timers: s.timers.map((t) => (t.id === id ? { ...t, rang: true, endsAt: Date.now() } : t)) })),
}));

export const clock = (sec: number): string => { const s = Math.max(0, Math.ceil(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`; };
/** "20 min", "1 h 30 min", "45 s" */
export const spoken = (sec: number): string => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); if (sec < 60) return `${sec} s`; return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`; };

let audio: AudioContext | null = null;
/** A short run of beeps, a buzz and a message: a timer that rings cannot be missed even with the screen off or the page in the background (it is checked against the clock, not counted). */
export function alarm(label: string) {
  try {
    audio ??= new AudioContext();
    for (let i = 0; i < 4; i++) {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.35;
      o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.3);
    }
  } catch { /* no sound available */ }
  try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch { /* none */ }
  toast(`Timer done: ${label}`);
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Timer done', { body: label }); } catch { /* not allowed here */ }
}
/** Asks once (on the first timer) so a ring can reach you with the app in the background; a refusal is fine, the sound and the screen still work. */
export function askToNotify() { try { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); } catch { /* no notifications here */ } }
