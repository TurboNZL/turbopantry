import type { Health, Status } from '@turbopantry/shared';

export interface ApiConfig { serverUrl: string; token: string }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Talks to the TurboPantry server: the one that served the page (serverUrl '') or another one (the Android app). */
export class Api {
  constructor(private cfg: ApiConfig) {}

  private async get<T>(path: string, auth = true): Promise<T> {
    const base = this.cfg.serverUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}${path}`, { headers: auth && this.cfg.token ? { authorization: `Bearer ${this.cfg.token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, res.status === 401 ? 'Wrong token' : `Server said ${res.status}`);
    return (await res.json()) as T;
  }

  health() { return this.get<Health>('/api/health', false); }
  status() { return this.get<Status>('/api/status'); }
}
