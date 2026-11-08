import type { Context, MiddlewareHandler } from "npm:hono@4.6.14";
import { toISOStamp } from "./domain/dates.ts";
import { sql, type Row } from "./db.ts";
import { verifyJwt } from "./crypto.ts";
import type { Role } from "./domain/types.ts";

export type AppUser = { id: string; role: Role; name: string; email: string | null; phone: string | null; is_active: boolean; last_login_at: string | null; created_at: string };
export type Env = { Variables: { user: AppUser } };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "error") { super(message); }
}
export const fail: (status: number, message: string, code?: string) => never = (status, message, code) => { throw new ApiError(status, message, code); };

export async function userFromToken(token: string | undefined | null): Promise<AppUser | null> {
  if (!token) return null;
  const p = await verifyJwt(token);
  if (!p?.sub || p.typ !== "user") return null;
  const [u] = await sql`select id, role, name, email, phone, is_active, last_login_at, created_at from users where id = ${p.sub} and is_active`;
  return (u as AppUser) ?? null;
}

export const bearer = (c: Context) => {
  const h = c.req.header("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
};

export function auth(...roles: Role[]): MiddlewareHandler<Env> {
  return async (c, next) => {
    const u = await userFromToken(bearer(c));
    if (!u) fail(401, "Please sign in again.", "unauthenticated");
    if (roles.length && !roles.includes(u!.role)) fail(403, "You don't have access to this.", "forbidden");
    c.set("user", u!);
    await next();
  };
}

export async function readJson<T = Record<string, any>>(c: Context): Promise<T> {
  try { return (await c.req.json()) as T; } catch { return {} as T; }
}

export const str = (v: unknown, name: string, { min = 0, max = 2000, optional = false } = {}): string => {
  if (v == null || v === "") { if (optional) return ""; fail(400, `${name} is required`, "validation"); }
  if (typeof v !== "string") fail(400, `${name} must be text`, "validation");
  const s = (v as string).trim();
  if (s.length < min) fail(400, `${name} is too short`, "validation");
  if (s.length > max) fail(400, `${name} is too long (max ${max})`, "validation");
  return s;
};
export const oneOf = <T extends string>(v: unknown, name: string, opts: readonly T[], dflt?: T): T => {
  if ((v == null || v === "") && dflt) return dflt;
  if (!opts.includes(v as T)) fail(400, `${name} must be one of: ${opts.join(", ")}`, "validation");
  return v as T;
};
export const uuid = (v: unknown, name = "id"): string => {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) fail(400, `${name} is not valid`, "validation");
  return v as string;
};
export const isoDate = (v: unknown, name: string, { optional = false } = {}): string => {
  const s = str(v, name, { optional, max: 10 });
  if (!s) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(400, `${name} must look like 2026-03-31`, "validation");
  return s;
};
export const publicUser = (u: Row): AppUser => ({ id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone, is_active: u.is_active, last_login_at: toISOStamp(u.last_login_at), created_at: toISOStamp(u.created_at) ?? "" });
