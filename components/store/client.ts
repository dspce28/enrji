/** Small fetch helpers for the store's API: JSON in, JSON out, { error } becomes a thrown Error. */
async function call<T>(method: string, url: string, data?: unknown): Promise<T> {
  const res = await fetch(url, {
    method, cache: 'no-store',
    headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Please try again.'), j, { status: res.status });
  return j as T;
}
export const get = <T,>(url: string) => call<T>('GET', url);
export const post = <T,>(url: string, data: unknown = {}) => call<T>('POST', url, data);
export const put = <T,>(url: string, data: unknown) => call<T>('PUT', url, data);
export const del = <T,>(url: string) => call<T>('DELETE', url);
