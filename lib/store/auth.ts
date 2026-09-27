import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';

/**
 * Login with mobile number and a one-time code.
 *
 * Codes: 6 digits, valid 5 minutes, 5 tries, stored only as an HMAC. Limits: 3 codes per number per
 * 10 minutes (10 a day), 10 per IP per 10 minutes. Sessions: a random token in an httpOnly cookie, stored
 * hashed, 30 days.
 *
 * Until WhatsApp/SMS delivery is connected, the code is shown on screen, but only while the site is in
 * staging (ALLOW_INDEXING isn't "true") or OTP_ON_SCREEN=true is set explicitly. At launch it switches off
 * by itself, so the on-screen code can never reach the live site by accident.
 */

export const SESSION_COOKIE = 'enrji_session';
const SESSION_DAYS = 30;
const OTP_MINUTES = 5;
const MAX_TRIES = 5;

export const otpOnScreen =
  process.env.OTP_ON_SCREEN === 'true' || (process.env.OTP_ON_SCREEN !== 'false' && process.env.ALLOW_INDEXING !== 'true');

// Signing key for codes. Set AUTH_SECRET on Vercel; without it, fall back to a key derived from the
// (secret) database URL so codes are still unforgeable.
const secret = () => process.env.AUTH_SECRET || createHash('sha256').update(`enrji:${process.env.DATABASE_URL}`).digest('hex');
const hmac = (s: string) => createHmac('sha256', secret()).update(s).digest('hex');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** "98765 43210", "+91 98765-43210", "098765…" → "+919876543210"; null if not an Indian mobile number. */
export function normalisePhone(input: string): string | null {
  let d = String(input ?? '').replace(/[^\d]/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

const adminPhones = () => new Set((process.env.ADMIN_PHONES ?? '').split(',').map((p) => normalisePhone(p)).filter(Boolean));

export class AuthError extends Error {
  constructor(message: string, public status = 400, public retryIn?: number) { super(message); }
}

export async function clientIp() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

/** Create and "send" a code. Returns the code itself only when it may be shown on screen. */
export async function requestOtp(phone: string, ip: string) {
  if (!otpOnScreen) throw new AuthError('Login by OTP is being set up. Please try again soon.', 503);
  const d = db();
  const since = (min: number) => sql`now() - make_interval(mins => ${min})`;
  const [[phone10], [phoneDay], [ip10]] = await Promise.all([
    d.select({ n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${schema.otpCodes.createdAt})` }).from(schema.otpCodes).where(and(eq(schema.otpCodes.phone, phone), gt(schema.otpCodes.createdAt, since(10)))),
    d.select({ n: sql<number>`count(*)::int` }).from(schema.otpCodes).where(and(eq(schema.otpCodes.phone, phone), gt(schema.otpCodes.createdAt, since(1440)))),
    d.select({ n: sql<number>`count(*)::int` }).from(schema.otpCodes).where(and(eq(schema.otpCodes.ip, ip), gt(schema.otpCodes.createdAt, since(10)))),
  ]);
  if (phone10.last && Date.now() - new Date(phone10.last).getTime() < 30_000) {
    throw new AuthError('Please wait a few seconds before asking for another code.', 429, Math.ceil((30_000 - (Date.now() - new Date(phone10.last).getTime())) / 1000));
  }
  if (phone10.n >= 3 || phoneDay.n >= 10 || ip10.n >= 10) throw new AuthError('Too many codes requested. Please try again in a few minutes.', 429);

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await d.transaction(async (tx) => {
    // Only the newest code works.
    await tx.update(schema.otpCodes).set({ usedAt: new Date() }).where(and(eq(schema.otpCodes.phone, phone), isNull(schema.otpCodes.usedAt)));
    await tx.insert(schema.otpCodes).values({ phone, codeHash: hmac(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_MINUTES * 60_000), ip });
  });
  // TODO(WhatsApp): send `code` to `phone` here once the WhatsApp Business API is connected.
  return { code: otpOnScreen ? code : undefined, expiresIn: OTP_MINUTES * 60 };
}

/** Check a code; on success sign the person in (creating their account on first login). */
export async function verifyOtp(phone: string, code: string, userAgent: string | null) {
  const d = db();
  const [otp] = await d.select().from(schema.otpCodes)
    .where(and(eq(schema.otpCodes.phone, phone), isNull(schema.otpCodes.usedAt), gt(schema.otpCodes.expiresAt, new Date())))
    .orderBy(desc(schema.otpCodes.createdAt)).limit(1);
  if (!otp) throw new AuthError('That code has expired. Please ask for a new one.');
  if (otp.attempts >= MAX_TRIES) throw new AuthError('Too many wrong tries. Please ask for a new code.', 429);
  const a = Buffer.from(otp.codeHash, 'hex'), b = Buffer.from(hmac(`${phone}:${String(code).trim()}`), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await d.update(schema.otpCodes).set({ attempts: sql`${schema.otpCodes.attempts} + 1` }).where(eq(schema.otpCodes.id, otp.id));
    const left = MAX_TRIES - otp.attempts - 1;
    throw new AuthError(left > 0 ? `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Please ask for a new code.');
  }

  const token = randomBytes(32).toString('base64url');
  const user = await d.transaction(async (tx) => {
    await tx.update(schema.otpCodes).set({ usedAt: new Date() }).where(eq(schema.otpCodes.id, otp.id));
    const role = adminPhones().has(phone) ? 'admin' : undefined;
    const [u] = await tx.insert(schema.users).values({ phone, role: role ?? 'customer', lastLoginAt: new Date() })
      .onConflictDoUpdate({ target: schema.users.phone, set: { lastLoginAt: new Date(), ...(role ? { role } : {}) } })
      .returning();
    if (u.blocked) throw new AuthError('This account is on hold. Please contact us.', 403);
    await tx.insert(schema.sessions).values({ tokenHash: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000), userAgent: userAgent?.slice(0, 300) });
    return u;
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400,
  });
  return user;
}

/** The signed-in person for this request, or null. */
export const currentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db().select({ user: schema.users }).from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return row && !row.user.blocked ? row.user : null;
});

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db().delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}
