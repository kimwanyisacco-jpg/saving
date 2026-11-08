"use client";
// Thin client for the Credit & Savings API (Supabase Edge Function "api").
// When NEXT_PUBLIC_API_URL is empty the same calls are served by the offline demo
// in ./demo, so the hosted presentation works with no backend at all.
import { handle } from "./demo";
import type { Edition, User } from "../../supabase/functions/_shared/domain/types";
import type { EditionCapabilities } from "../../supabase/functions/_shared/domain/editions";
import { editionCapabilities } from "../../supabase/functions/_shared/domain/editions";

export const API_ROOT = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
export const OFFLINE = !API_ROOT;
const API = OFFLINE ? "" : API_ROOT + "/api/v1";

export type Role = "admin" | "staff";
export { type User };

export interface Session {
  token: string;
  user: User;
  edition: Edition;
  capabilities: EditionCapabilities;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

const KEY = "credit-savings.session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
export function setSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}


interface Options { method?: string; body?: unknown; token?: string | null }

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const session = getSession();
  const token = opts.token === undefined ? session?.token : opts.token;
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");

  if (OFFLINE) {
    const res = handle(method, path, opts.body, session ? { id: session.user.id, name: session.user.name } : undefined);
    if (res.blob) return res as unknown as T;
    if (res.status >= 400) {
      // Only a 401 on a request that carried a token means the session ended.
      // A 401 from sign-in (no token) is a wrong password and must reach the form.
      if (res.status === 401 && token) { setSession(null); if (typeof window !== "undefined") window.location.href = "/login/?expired=1"; }
      throw new ApiError(res.status, res.body?.error || "Request failed", res.body?.code);
    }
    return res.body as T;
  }

  const headers: Record<string, string> = {};
  if (token) headers.authorization = "Bearer " + token;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let r: Response;
  try {
    r = await fetch(API + path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { text }; }
  if (!r.ok) {
    if (r.status === 401 && token) { setSession(null); if (typeof window !== "undefined") window.location.href = "/login/?expired=1"; }
    throw new ApiError(r.status, data?.error || `Request failed (${r.status})`, data?.code);
  }
  return data as T;
}

/** Download a file produced by the API (PDF or CSV). */
export async function download(path: string, fallbackName: string) {
  const token = getSession()?.token;
  if (OFFLINE) {
    const res = handle("GET", path, undefined);
    if (res.status >= 400 || !res.blob) throw new ApiError(res.status, res.body?.error || "Download failed", res.body?.code);
    triggerDownload(res.blob, res.filename || fallbackName);
    return;
  }
  const r = await fetch(API + path, { headers: token ? { authorization: "Bearer " + token } : {} });
  if (!r.ok) {
    let message = `Download failed (${r.status})`;
    try { message = (await r.json())?.error ?? message; } catch { /* not json */ }
    throw new ApiError(r.status, message);
  }
  const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") || "")?.[1] || fallbackName;
  triggerDownload(await r.blob(), name);
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Opens a generated PDF in a new tab (used by "Print statement"). */
export async function openPdf(path: string, fallbackName: string) {
  const token = getSession()?.token;
  let blob: Blob;
  if (OFFLINE) {
    const res = handle("GET", path, undefined);
    if (res.status >= 400 || !res.blob) throw new ApiError(res.status, res.body?.error || "Could not build the statement", res.body?.code);
    blob = res.blob;
  } else {
    const r = await fetch(API + path, { headers: token ? { authorization: "Bearer " + token } : {} });
    if (!r.ok) {
      let message = `Could not build the statement (${r.status})`;
      try { message = (await r.json())?.error ?? message; } catch { /* not json */ }
      throw new ApiError(r.status, message);
    }
    blob = await r.blob();
  }
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) triggerDownload(blob, fallbackName);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export { editionCapabilities };
