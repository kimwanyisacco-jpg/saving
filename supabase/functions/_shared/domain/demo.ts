// Deterministic demo dataset. The same generator seeds the Supabase database and
// powers the browser-only demo, so what a prospect sees offline is exactly what
// the live API returns.
import type { BusinessProfile, Customer, Edition, Transaction, TxKind, TxMethod } from "./types.ts";
import { EDITION_META } from "./editions.ts";
import { addDays, addMonths, today } from "./dates.ts";

export interface DemoStaff {
  name: string;
  email: string;
  password: string;
  role: "admin" | "staff";
  phone: string;
}

export interface DemoDataset {
  edition: Edition;
  profile: BusinessProfile;
  staff: DemoStaff[];
  customers: Customer[];
  transactions: Transaction[];
  generated_at: string;
}

/** Mulberry32: small, fast, and identical in Deno, Node and the browser. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX = "0123456789abcdef";
/** Deterministic RFC-4122 v4-shaped id, so seeded rows are stable across runs. */
function uuidFrom(rand: () => number): string {
  let s = "";
  for (let i = 0; i < 32; i++) s += HEX[Math.floor(rand() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

const FIRST = ["Amara", "Brian", "Grace", "Peter", "Miriam", "Hakim", "Sarah", "Joel", "Esther", "David", "Ruth", "Moses", "Agnes", "Ivan", "Betty", "Samuel", "Proscovia", "Isaac", "Lydia", "Joseph", "Naomi", "Patrick", "Rebecca", "Simon", "Teddy", "Winnie", "Kevin", "Justine", "Alex", "Florence"];
const LAST = ["Nakato", "Okello", "Achieng", "Ssali", "Mwesigwa", "Nabirye", "Kizza", "Namuli", "Byaruhanga", "Tumwine", "Atim", "Kaggwa", "Nsubuga", "Kyeyune", "Mugisha", "Auma", "Kalema", "Bwambale", "Nassiwa", "Opio"];
const VILLAGES = ["Ntinda", "Kireka", "Bweyogerere", "Najjera", "Kiwatule", "Nakawa", "Bukoto", "Kyaliwajjala", "Seeta", "Nansana", "Matugga", "Gayaza", "Kira", "Mukono", "Wakiso", "Entebbe Road"];
const OCCUPATION = ["Market vendor", "Boda rider", "Tailor", "Teacher", "Farmer", "Shopkeeper", "Carpenter", "Salon owner", "Mechanic", "Restaurant owner", "Nurse", "Driver", "Welder", "Mason", "Fish trader", "Barber"];
const METHODS: TxMethod[] = ["cash", "cash", "cash", "mobile_money", "mobile_money", "bank", "cheque"];

const BUSINESS: Record<Edition, BusinessProfile> = {
  basic: {
    name: "Nakawa Traders Savings Group",
    address: "Ntinda, Kampala, Uganda",
    phone: "+256 755 274 944",
    email: "ntinda.traders@example.co.ug",
    logo_text: "NTS",
    footer_note: "Thank you for saving with us. This statement is a record of transactions captured in the system.",
  },
  classic: {
    name: "Kampala Community Savings & Credit",
    address: "Nakawa, Ntinda, Kampala, Uganda",
    phone: "+256 755 274 944",
    email: "info@gss-tec.com",
    logo_text: "KCS",
    footer_note: "Balances are calculated from recorded transactions. Please report any difference within 7 days.",
  },
  enhanced: {
    name: "Wakiso Enterprise Savings & Credit Ltd",
    address: "Kyaliwajjala, Wakiso, Uganda",
    phone: "+256 755 274 944",
    email: "wakiso.enterprise@example.co.ug",
    logo_text: "WES",
    footer_note: "Report any difference within 7 days. This statement was produced from the credit and savings records system.",
  },
};

const STAFF: Record<Edition, DemoStaff[]> = {
  basic: [
    { name: "Hakim Ssali", email: "admin@basic.demo", password: "Basic#1234", role: "admin", phone: "+256700100001" },
  ],
  classic: [
    { name: "Grace Nakato", email: "admin@classic.demo", password: "Classic#1234", role: "admin", phone: "+256700100002" },
    { name: "Peter Okello", email: "staff@classic.demo", password: "Classic#5678", role: "staff", phone: "+256700100003" },
  ],
  enhanced: [
    { name: "Miriam Achieng", email: "admin@enhanced.demo", password: "Enhanced#1234", role: "admin", phone: "+256700100004" },
    { name: "David Mwesigwa", email: "staff@enhanced.demo", password: "Enhanced#5678", role: "staff", phone: "+256700100005" },
  ],
};

const SEED: Record<Edition, number> = { basic: 1001, classic: 2027, enhanced: 3009 };

const round = (n: number, step = 1000) => Math.max(step, Math.round(n / step) * step);

export function buildDemoDataset(edition: Edition): DemoDataset {
  const rand = rng(SEED[edition]);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const end = today();
  const start = addMonths(end, -8);
  const generated_at = new Date().toISOString();

  const staff = STAFF[edition];
  const customers: Customer[] = [];
  const transactions: Transaction[] = [];
  const count = edition === "basic" ? 18 : edition === "enhanced" ? 32 : 24;
  let receipt = 100000;
  let codeSeq = 0;

  for (let i = 0; i < count; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const village = pick(VILLAGES);
    const joined_on = addDays(start, between(0, 40));
    const status: Customer["status"] = i % 13 === 5 ? "dormant" : i % 17 === 9 ? "closed" : "active";
    const id = uuidFrom(rand);
    const code = "C-" + String(++codeSeq).padStart(4, "0");
    customers.push({
      id, code, name,
      phone: "+2567" + String(between(10, 99)) + String(between(100000, 999999)),
      email: i % 5 === 0 ? `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@example.co.ug` : null,
      national_id: i % 3 === 0 ? "CF" + between(1000000, 9999999) + "UG" : null,
      address: `${village}, ${pick(["Kampala", "Wakiso", "Mukono"])}`,
      joined_on,
      status,
      notes: i % 7 === 0 ? `Occupied as ${pick(OCCUPATION)}. Guarantor on file.` : null,
      created_at: joined_on + "T08:00:00.000Z",
      updated_at: generated_at,
    });

    // Opening deposit, then monthly activity.
    const savingStep = between(20, 120) * 1000;
    let cursor = joined_on;
    let first = true;
    while (cursor <= end) {
      const amount = round(savingStep * (first ? between(2, 5) : between(8, 20)) / 10);
      transactions.push(tx(rand, uuidFrom(rand), id, "savings_deposit", amount, cursor, methods(pick), `Deposit at ${village} desk`, receipt++));
      if (rand() < 0.32) {
        const wd = round(amount * (between(3, 8) / 10));
        transactions.push(tx(rand, uuidFrom(rand), id, "savings_withdrawal", wd, addDays(cursor, between(1, 12)), methods(pick), "Withdrawal", receipt++));
      }
      if (!first && rand() < 0.22) {
        const principal = round(between(50, 400) * 1000);
        const issuedOn = addDays(cursor, between(1, 10));
        if (issuedOn <= end) {
          transactions.push(tx(rand, uuidFrom(rand), id, "credit_issued", principal, issuedOn, methods(pick), "Credit advanced", receipt++));
          const parts = between(2, 4);
          for (let p = 0; p < parts; p++) {
            const on = addDays(issuedOn, 15 * (p + 1) + between(0, 6));
            if (on > end) break;
            transactions.push(tx(rand, uuidFrom(rand), id, "credit_repayment", round(principal / parts), on, methods(pick), `Repayment ${p + 1} of ${parts}`, receipt++));
          }
        }
      }
      cursor = addMonths(cursor, 1);
      first = false;
    }
  }

  // A recorded correction (Classic and Enhanced include the correction history).
  if (edition !== "basic" && transactions.length > 12) {
    const victim = transactions[8];
    victim.voided_at = new Date().toISOString();
    victim.void_reason = "Duplicate entry - receipt written twice";
  }

  transactions.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  return { edition, profile: BUSINESS[edition], staff, customers, transactions, generated_at };
}

function methods(pick: <T>(l: readonly T[]) => T): TxMethod { return pick(METHODS); }

function tx(rand: () => number, id: string, customer_id: string, kind: TxKind, amount: number, occurred_on: string, method: TxMethod, note: string, receipt: number): Transaction {
  const prefix = kind === "savings_deposit" ? "DEP" : kind === "savings_withdrawal" ? "WDR" : kind === "credit_issued" ? "CRD" : "RPY";
  return {
    id,
    customer_id,
    kind,
    amount,
    occurred_on,
    method,
    reference: `${prefix}-${String(receipt).slice(-5)}`,
    note,
    receipt_no: "R-" + receipt,
    recorded_by: null,
    created_at: occurred_on + "T" + String(8 + Math.floor(rand() * 9)).padStart(2, "0") + ":30:00.000Z",
    voided_at: null,
    void_reason: null,
  };
}

/** Demo credentials shown on the login screen. */
export const demoAccounts = (edition: Edition) =>
  buildDemoDataset(edition).staff.map((s) => ({ edition, role: s.role, name: s.name, login: s.email, password: s.password, business: BUSINESS[edition].name }));

export const demoBusiness = (edition: Edition) => BUSINESS[edition];
export const demoPrice = (edition: Edition) => EDITION_META[edition];
