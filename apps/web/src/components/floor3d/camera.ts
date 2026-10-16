import { useCallback, useRef, useState } from 'react';

/** Pixels per grid cell at zoom 1, and per height step. */
export const CELL = 32;
export const STEP_H = 14;

export interface Cam { yaw: number; pitch: number; zoom: number; px: number; py: number }
export const MIN_PITCH = 12, MAX_PITCH = 82, MIN_ZOOM = 0.2, MAX_ZOOM = 3.5;
const HOME: Omit<Cam, 'zoom'> = { yaw: 30, pitch: 55, px: 0, py: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface CameraApi {
  cam: Cam;
  /** What a drag on empty floor does. */
  drag: 'pan' | 'orbit';
  setDrag(d: 'pan' | 'orbit'): void;
  turn(deg: number): void;
  tilt(deg: number): void;
  zoomBy(factor: number): void;
  setZoom(z: number): void;
  /** Move the view by screen pixels (the floor follows). */
  panBy(dx: number, dy: number): void;
  reset(): void;
  /** What "fit" means: this zoom, looking at this point of the floor (pixels from its centre). Set by the scene; `content` says whether blocks drive it. */
  setFit(z: number, cx: number, cy: number, content: boolean): void;
  /** Always the latest camera, for event handlers. */
  ref: { current: Cam };
}

/** The camera for one floor plan: turn, tilt, zoom and pan, all clamped, plus "reset view". */
export function useCamera(): CameraApi {
  const [cam, setCam] = useState<Cam>({ ...HOME, zoom: 0.6 });
  const [drag, setDrag] = useState<'pan' | 'orbit'>('pan');
  const ref = useRef(cam);
  ref.current = cam;
  const fit = useRef({ z: 0.6, cx: 0, cy: 0 });
  const stage = useRef(0); // 0 nothing fitted yet, 1 fitted to the empty floor, 2 fitted to the blocks
  const touched = useRef(false);
  const set = useCallback((n: Cam) => { ref.current = n; setCam(n); }, []);
  const patch = useCallback((f: (c: Cam) => Cam) => { touched.current = true; set(f(ref.current)); }, [set]);
  const home = useCallback((): Cam => {
    const { z, cx, cy } = fit.current, a = (HOME.yaw * Math.PI) / 180, p = (HOME.pitch * Math.PI) / 180;
    return { ...HOME, zoom: z, px: -z * (cx * Math.cos(a) - cy * Math.sin(a)), py: -z * (cx * Math.sin(a) + cy * Math.cos(a)) * Math.cos(p) };
  }, []);
  return {
    cam, drag, setDrag, ref,
    turn: useCallback((deg) => patch((c) => ({ ...c, yaw: ((c.yaw + deg) % 360 + 360) % 360 })), [patch]),
    tilt: useCallback((deg) => patch((c) => ({ ...c, pitch: clamp(c.pitch + deg, MIN_PITCH, MAX_PITCH) })), [patch]),
    zoomBy: useCallback((f) => patch((c) => ({ ...c, zoom: clamp(c.zoom * f, MIN_ZOOM, MAX_ZOOM) })), [patch]),
    setZoom: useCallback((z) => patch((c) => ({ ...c, zoom: clamp(z, MIN_ZOOM, MAX_ZOOM) })), [patch]),
    panBy: useCallback((dx, dy) => patch((c) => ({ ...c, px: clamp(c.px + dx, -1500, 1500), py: clamp(c.py + dy, -1500, 1500) })), [patch]),
    reset: useCallback(() => { touched.current = false; set(home()); }, [set, home]),
    setFit: useCallback((z, cx, cy, content) => {
      fit.current = { z: clamp(z, MIN_ZOOM, MAX_ZOOM), cx, cy };
      if (stage.current === 0) { stage.current = content ? 2 : 1; set(home()); }
    }, [set, home]),
  };
}

/** A move on the screen (pixels) as a move on the floor (cells). Exact: the view is a plain rotation, tilt and scale. */
export function screenToFloor(cam: Cam, dx: number, dy: number): { x: number; y: number } {
  const a = (cam.yaw * Math.PI) / 180, p = (cam.pitch * Math.PI) / 180;
  const rx = dx / cam.zoom, ry = dy / (cam.zoom * Math.cos(p));
  return { x: (rx * Math.cos(a) + ry * Math.sin(a)) / CELL, y: (-rx * Math.sin(a) + ry * Math.cos(a)) / CELL };
}

/** The whole-cell step on the floor that is closest to "one step up/down/left/right on the screen". */
export function screenStep(cam: Cam, sx: number, sy: number): { x: number; y: number } {
  const f = screenToFloor({ ...cam, pitch: 0, zoom: 1 }, sx, sy);
  return Math.abs(f.x) >= Math.abs(f.y) ? { x: Math.sign(f.x), y: 0 } : { x: 0, y: Math.sign(f.y) };
}
