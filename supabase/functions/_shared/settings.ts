// Application settings: the licensed edition and the business profile that appears
// on statements. Values live in app_settings; environment secrets act as defaults
// for the business profile so a fresh deploy prints sensible headers immediately.
import { sql } from "./db.ts";
import { env } from "./env.ts";
import { isEdition } from "./domain/editions.ts";
import type { BusinessProfile, Edition } from "./domain/types.ts";

const DEFAULTS: Record<string, string> = {
  edition: env.defaultEdition,
  business_name: env.business.name || "Credit & Savings Records",
  business_address: env.business.address || "",
  business_phone: env.business.phone || "",
  business_email: env.business.email || "",
  business_logo_text: env.business.logo_text || "",
  business_footer_note: "Balances are calculated from recorded transactions.",
  handover_on: "",
};

let ensured: Promise<unknown> | null = null;
/** Create the table on first use so deploying the function alone is enough. */
function ensureTable() {
  ensured ??= sql`create table if not exists app_settings (
      key text primary key, value text,
      updated_by uuid references users(id) on delete set null,
      updated_at timestamptz not null default now())`
    .then(() => sql`insert into app_settings (key, value) values ('edition', ${DEFAULTS.edition}) on conflict (key) do nothing`)
    .catch((e) => { ensured = null; console.error("settings table", e); });
  return ensured;
}

export async function allSettings(): Promise<Record<string, string>> {
  const out = { ...DEFAULTS };
  try {
    await ensureTable();
    const rows = await sql`select key, value from app_settings`;
    for (const r of rows) if (r.value != null && r.value !== "") out[r.key] = r.value;
  } catch (e) { console.error("settings read", e); }
  return out;
}

export async function getSetting(key: string): Promise<string | null> {
  const s = await allSettings();
  return s[key] ?? null;
}

export async function setSetting(key: string, value: string | null, userId: string) {
  await ensureTable();
  if (value === null) await sql`delete from app_settings where key = ${key}`;
  else await sql`insert into app_settings (key, value, updated_by) values (${key}, ${value}, ${userId})
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
}

export async function currentEdition(): Promise<Edition> {
  const v = await getSetting("edition");
  return isEdition(v) ? v : "classic";
}

export async function businessProfile(): Promise<BusinessProfile> {
  const s = await allSettings();
  return {
    name: s.business_name,
    address: s.business_address,
    phone: s.business_phone,
    email: s.business_email,
    logo_text: s.business_logo_text,
    footer_note: s.business_footer_note,
  };
}

export const SETTING_KEYS = Object.keys(DEFAULTS);
