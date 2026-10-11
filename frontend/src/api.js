import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : 'https://queueless-bywb.onrender.com');
export const img = (kind, name) => `${BASE}/img/${kind}/${name || 'default.jpg'}`;
export const rupees = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Render's free plan sleeps; requests slower than 4 s flip the "waking up" banner on
let slow = 0;
const subs = new Set();
const setSlow = d => { slow += d; subs.forEach(f => f()); };
export const useWaking = () =>
  useSyncExternalStore(f => (subs.add(f), () => subs.delete(f)), () => slow > 0);

// 401 here means a wrong password, not an expired session
const NO_LOGOUT = ['/users/login', '/users/updateMyPassword'];

export async function api(method, path, body) {
  const token = localStorage.getItem('jwt');
  const isForm = body instanceof FormData;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  let fired = false;
  const timer = setTimeout(() => { fired = true; setSlow(1); }, 4000);
  try {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers,
      body: isForm ? body : body && JSON.stringify(body)
    });
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (res.status === 401 && token && !NO_LOGOUT.includes(path)) {
      localStorage.removeItem('jwt');
      window.dispatchEvent(new Event('ql-logout'));
    }
    if (!res.ok) throw new Error(data.message || `Something went wrong (${res.status}).`);
    return data;
  } catch (err) {
    if (err instanceof TypeError) throw new Error("Can't reach the server. Check your connection and try again.");
    throw err;
  } finally {
    clearTimeout(timer);
    if (fired) setSlow(-1);
  }
}

// GET with optional polling (paused while the tab is hidden)
export function useApi(path, pollMs) {
  const [state, setState] = useState({ loading: true });
  const current = useRef(path);
  current.current = path;

  const load = useCallback(() => {
    if (!path) return;
    return api('GET', path).then(
      data => current.current === path && setState({ data }),
      err => current.current === path && setState(s => ({ ...s, loading: false, error: err.message }))
    );
  }, [path]);

  useEffect(() => {
    setState(s => ({ ...s, loading: true, error: null }));
    load();
  }, [load]);

  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => !document.hidden && load(), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { ...state, reload: load };
}
