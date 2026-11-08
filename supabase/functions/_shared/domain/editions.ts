// The three packages from the quotation. The server gates every request on the
// edition the business is licensed for, so a Basic deployment physically cannot
// serve a Classic-only report.
import type { Edition } from "./types.ts";

export const EDITIONS: readonly Edition[] = ["basic", "classic", "enhanced"] as const;

export interface EditionMeta {
  id: Edition;
  name: string;
  tagline: string;
  price_ugx: number;
  deposit_ugx: number;
  demo_ugx: number;
  handover_ugx: number;
  delivery_days: string;
  recommended: boolean;
}

export const EDITION_META: Record<Edition, EditionMeta> = {
  basic: {
    id: "basic", name: "Basic", tagline: "For simple record keeping",
    price_ugx: 900_000, deposit_ugx: 450_000, demo_ugx: 270_000, handover_ugx: 180_000,
    delivery_days: "5-7 working days", recommended: false,
  },
  classic: {
    id: "classic", name: "Classic", tagline: "For a growing business",
    price_ugx: 1_500_000, deposit_ugx: 750_000, demo_ugx: 450_000, handover_ugx: 300_000,
    delivery_days: "1-2 weeks", recommended: true,
  },
  enhanced: {
    id: "enhanced", name: "Enhanced", tagline: "For broader reporting needs",
    price_ugx: 2_300_000, deposit_ugx: 1_150_000, demo_ugx: 690_000, handover_ugx: 460_000,
    delivery_days: "2-3 weeks", recommended: false,
  },
};

/** Ordered feature list, exactly as written in the quotation. `min` is the lowest
 *  edition that includes the feature, which is what the pricing page renders. */
export interface Feature {
  key: string;
  label: string;
  min: Edition;
}
export const FEATURES: readonly Feature[] = [
  { key: "admin_login", label: "Admin login", min: "basic" },
  { key: "customers_crud", label: "Add, edit and search customers", min: "basic" },
  { key: "savings", label: "Record savings deposits and withdrawals", min: "basic" },
  { key: "credit", label: "Record credit issued and repayments", min: "basic" },
  { key: "statement_basic", label: "Basic customer statement PDF", min: "basic" },
  { key: "dashboard_basic", label: "Basic dashboard totals", min: "basic" },
  { key: "profiles_history", label: "Customer profiles and full transaction history", min: "classic" },
  { key: "separate_balances", label: "Separate savings and credit balances", min: "classic" },
  { key: "statement_range", label: "Statement by customer and date range", min: "classic" },
  { key: "statement_branded", label: "Branded, print-ready PDF statements", min: "classic" },
  { key: "dashboard_summaries", label: "Dashboard with customer, savings, credit and repayment summaries", min: "classic" },
  { key: "csv_export", label: "CSV export of records", min: "classic" },
  { key: "backup", label: "Database backup setup and transaction correction history", min: "classic" },
  { key: "dashboard_enhanced", label: "Enhanced dashboard and date-filtered reports", min: "enhanced" },
  { key: "period_reports", label: "Savings and credit summaries across selected periods", min: "enhanced" },
  { key: "activity_reports", label: "Customer activity and outstanding-credit reports", min: "enhanced" },
  { key: "import", label: "Import existing records from one clean spreadsheet (up to 500 rows)", min: "enhanced" },
  { key: "search_filter", label: "Improved search and filtering", min: "enhanced" },
  { key: "priority_support", label: "Priority bug-fix support for 60 days after handover", min: "enhanced" },
];

const rank = (e: Edition) => EDITIONS.indexOf(e);
/** Does `edition` include the capability that first appears at `min`? */
export const includes = (edition: Edition, min: Edition) => rank(edition) >= rank(min);

/** Capability keys the server checks before running a route handler. */
export const CAPS = {
  statements: "statement_basic",
  statementRange: "statement_range",
  profiles: "profiles_history",
  separateBalances: "separate_balances",
  csv: "csv_export",
  backup: "backup",
  corrections: "backup",
  reports: "period_reports",
  activityReports: "activity_reports",
  import: "import",
  improvedSearch: "search_filter",
} as const;
export type Cap = (typeof CAPS)[keyof typeof CAPS];

const CAP_MIN: Record<string, Edition> = Object.fromEntries(FEATURES.map((f) => [f.key, f.min]));
export const hasCap = (edition: Edition, cap: Cap) => includes(edition, CAP_MIN[cap]);

/** What each edition is allowed to do, used by the UI to grey out or hide screens. */
export function editionCapabilities(edition: Edition) {
  const on = (cap: Cap) => hasCap(edition, cap);
  return {
    edition,
    statementRange: on(CAPS.statementRange),
    separateBalances: on(CAPS.separateBalances),
    csv: on(CAPS.csv),
    backup: on(CAPS.backup),
    corrections: on(CAPS.corrections),
    reports: on(CAPS.reports),
    activityReports: on(CAPS.activityReports),
    import: on(CAPS.import),
    improvedSearch: on(CAPS.improvedSearch),
  };
}
export type EditionCapabilities = ReturnType<typeof editionCapabilities>;

export const isEdition = (v: unknown): v is Edition => EDITIONS.includes(v as Edition);
export const editionName = (e: Edition) => EDITION_META[e].name;
