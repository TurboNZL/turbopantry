import { Link } from 'react-router-dom';
import { ApiError } from '../lib/api.ts';

/** Shown instead of a page's content when the server says the token is missing or wrong, or cannot be reached. */
export function LoadError({ error }: { error: Error }) {
  const auth = error instanceof ApiError && error.status === 401;
  return (
    <div className="card space-y-2 p-6" role="alert">
      <p className="font-medium">{auth ? 'Sign in to see this' : 'Could not load this'}</p>
      <p className="text-sm text-muted">{auth ? 'This server needs your access token.' : error.message}</p>
      {auth && <Link to="/settings?tab=server" className="btn btn-accent inline-flex">Open Settings → Server</Link>}
    </div>
  );
}
