/** Types and pure helpers shared by the server and the web client. */
export const APP_NAME = 'TurboPantry';

export interface Health { ok: true; name: string; version: string }
export interface Status { user: string; users: number; recipes: number; lists: number }

/** GET /api/admin/update: whether this server can update itself, and how a running update is going. */
export interface ServerUpdate { available: boolean; restarts: boolean; status: 'idle' | 'running' | 'done' | 'error'; log: string[]; startedAt: number | null; restarting: boolean }

export * from './recipe.ts';
export * from './ingredient.ts';
export * from './duration.ts';
export * from './method.ts';
export * from './units.ts';
export * from './items.ts';
