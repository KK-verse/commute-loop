// API client. The token is a revocable session token; no production data is kept in browser storage.
const KEY = "cl_token", UKEY = "cl_user";
export const session = {
  get token() { try { return localStorage.getItem(KEY); } catch { return null; } },
  get user() { try { return JSON.parse(localStorage.getItem(UKEY) || "null"); } catch { return null; } },
  set(token, user) { try { localStorage.setItem(KEY, token); localStorage.setItem(UKEY, JSON.stringify(user)); } catch {} },
  setUser(user) { try { localStorage.setItem(UKEY, JSON.stringify(user)); } catch {} },
  clear() { try { localStorage.removeItem(KEY); localStorage.removeItem(UKEY); } catch {} },
};

export class ApiError extends Error { constructor(message, status, data) { super(message); this.status = status; this.data = data; } }

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (session.token) headers.Authorization = "Bearer " + session.token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch("/api" + path, { method, headers, body: payload }); }
  catch { throw new ApiError("Can't reach CommuteLoop. Check your connection and try again.", 0); }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401 && session.token) { session.clear(); onUnauthorized(); }
    let msg = (data && data.detail) || "Something went wrong. Try again.";
    if (Array.isArray(msg)) msg = msg.map((e) => `${(e.loc || []).slice(1).join(" ")}: ${e.msg}`).join("; ");
    throw new ApiError(msg, res.status, data);
  }
  return data;
}
