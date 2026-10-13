/** Types shared by the server and the web client. Domain types grow here as features land. */
export const APP_NAME = 'TurboPantry';

export interface Health { ok: true; name: string; version: string }
export interface Status { user: string; users: number; recipes: number; lists: number }
