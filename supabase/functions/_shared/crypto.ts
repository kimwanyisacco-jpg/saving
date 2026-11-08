// Password hashing (PBKDF2) and JWT (HS256). No external dependencies, so the
// same code runs on Supabase Edge Functions and in local development.
import { env } from "./env.ts";

const te = new TextEncoder();
const td = new TextDecoder();

export const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (b: ArrayBuffer | Uint8Array) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

export function randomCode(n = 6, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"): string {
  const r = crypto.getRandomValues(new Uint8Array(n));
  return [...r].map((x) => alphabet[x % alphabet.length]).join("");
}

const secretCache = new Map<string, Uint8Array>();
async function secret(name: string, explicit: string): Promise<Uint8Array> {
  if (secretCache.has(name)) return secretCache.get(name)!;
  let out: Uint8Array;
  if (explicit) {
    out = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(explicit)));
  } else {
    const base = env.serviceKey || "credit-savings-local-development-only-secret";
    const ikm = await crypto.subtle.importKey("raw", te.encode(base), "HKDF", false, ["deriveBits"]);
    out = new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: te.encode("credit-savings"), info: te.encode(name) }, ikm, 256));
  }
  secretCache.set(name, out);
  return out;
}

const ITER = 100_000;
export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", te.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, key, 256);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, it, s, h] = stored.split("$");
  if (alg !== "pbkdf2") return false;
  const key = await crypto.subtle.importKey("raw", te.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(s), iterations: Number(it) }, key, 256));
  const want = unb64(h);
  if (want.length !== bits.length) return false;
  let diff = 0; for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ want[i];
  return diff === 0;
}

async function hmacKey() {
  return crypto.subtle.importKey("raw", (await secret("jwt", env.jwtSecret)) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signJwt(payload: Record<string, unknown>, ttlSec = 60 * 60 * 12): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(te.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(te.encode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec, iss: "credit-savings" })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), te.encode(head + "." + body));
  return head + "." + body + "." + b64url(sig);
}

/** Seconds since the epoch for a stored timestamp, or null if it is unset.
 *  Used to compare a token's `pwd` claim against the user's last password change. */
export const epochOf = (v: unknown): number | null => {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};
export async function verifyJwt(token: string): Promise<Record<string, any> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), unb64url(parts[2]), te.encode(parts[0] + "." + parts[1]));
  if (!ok) return null;
  try {
    const p = JSON.parse(td.decode(unb64url(parts[1])));
    if (p.iss !== "credit-savings" || (p.exp && p.exp < Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}
