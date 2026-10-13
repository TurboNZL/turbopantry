/** Types and pure helpers shared by the server and the web client. */
export const APP_NAME = 'TurboPantry';

export interface Health { ok: true; name: string; version: string }
export interface Status { user: string; users: number; recipes: number; lists: number }

export * from './recipe.ts';
export * from './ingredient.ts';
export * from './duration.ts';
