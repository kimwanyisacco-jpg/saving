// Runtime configuration. On Supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// SUPABASE_DB_URL are injected automatically; everything else is optional.
const g = (k: string) => (Deno.env.get(k) ?? "").trim();

export const env = {
  dbUrl: g("SUPABASE_DB_URL") || g("DATABASE_URL"),
  supabaseUrl: g("SUPABASE_URL"),
  serviceKey: g("SUPABASE_SERVICE_ROLE_KEY"),
  appUrl: g("APP_URL") || "http://localhost:3000",
  corsOrigins: g("CORS_ORIGINS") || "*",
  jwtSecret: g("APP_JWT_SECRET"),
  demoMode: g("DEMO_MODE") !== "false",
  defaultEdition: (g("EDITION") || "classic").toLowerCase(),
  seedOnBoot: g("SEED_DEMO") === "true",
  business: {
    name: g("BUSINESS_NAME"),
    address: g("BUSINESS_ADDRESS"),
    phone: g("BUSINESS_PHONE"),
    email: g("BUSINESS_EMAIL"),
    logo_text: g("BUSINESS_LOGO_TEXT"),
  },
};

export const usingSupabase = () => Boolean(env.supabaseUrl && env.serviceKey);
