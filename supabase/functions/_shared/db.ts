import postgres from "npm:postgres@3.4.5";
import { env } from "./env.ts";

if (!env.dbUrl) console.error("Credit & Savings: SUPABASE_DB_URL / DATABASE_URL is not set");

// prepare:false keeps us compatible with Supabase's transaction pooler.
export const sql = postgres(env.dbUrl, {
  prepare: false,
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
  transform: { undefined: null },
});

export type Row = Record<string, any>;
export const json = (v: unknown) => sql.json(v as any);
