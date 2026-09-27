import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ownStore } from '../db';
import { AuthError, currentUser } from './auth';

/** A problem to show the shopper as-is (validation, stock, rules). */
export class StoreError extends Error {
  constructor(message: string, public status = 400, public extra?: Record<string, unknown>) { super(message); }
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response | unknown>;

/**
 * Wraps an API route: the store must be switched on, changes must come from this site (Origin check, on top
 * of SameSite cookies), and errors come back as { error } with the right status. Unexpected errors are
 * logged and shown as a generic message.
 */
export function route(handler: Handler) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    if (!ownStore) return NextResponse.json({ error: 'The store is not switched on yet.' }, { status: 503 });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.get('origin');
      if (origin && new URL(origin).host !== req.headers.get('host')) return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
    }
    try {
      const out = await handler(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      if (e instanceof StoreError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
      if (e instanceof AuthError) return NextResponse.json({ error: e.message, retryIn: e.retryIn }, { status: e.status });
      console.error('[store api]', req.method, req.nextUrl.pathname, e);
      return NextResponse.json({ error: 'Something went wrong on our side. Please try again.' }, { status: 500 });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new StoreError('Bad request'); }
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new StoreError('Please log in to continue.', 401);
  return u;
}

export async function requireStaff() {
  const u = await requireUser();
  if (u.role !== 'admin' && u.role !== 'staff') throw new StoreError('Not allowed.', 403);
  return u;
}

export const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
