// Domain types shared by the API (Supabase Edge Function) and the web app.

/** The three packages sold in the quotation. */
export type Edition = "basic" | "classic" | "enhanced";

export type Role = "admin" | "staff";

export type TxKind = "savings_deposit" | "savings_withdrawal" | "credit_issued" | "credit_repayment";
export type TxMethod = "cash" | "bank" | "mobile_money" | "cheque" | "other";
export type CustomerStatus = "active" | "dormant" | "closed";

export interface User {
  id: string;
  role: Role;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  national_id: string | null;
  address: string | null;
  joined_on: string;
  status: CustomerStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  customer_id: string;
  customer_name?: string | null;
  customer_code?: string | null;
  kind: TxKind;
  amount: number;
  occurred_on: string;
  method: TxMethod;
  reference: string | null;
  note: string | null;
  receipt_no: string | null;
  recorded_by: string | null;
  recorded_by_name?: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface Correction {
  id: string;
  transaction_id: string;
  action: "void" | "restore" | "amend";
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string | null;
  actor_id: string | null;
  actor_name?: string | null;
  created_at: string;
}

export interface BusinessProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  logo_text: string;
  footer_note: string;
}

export interface Balances {
  savings: number;
  credit_outstanding: number;
  savings_in: number;
  savings_out: number;
  credit_issued: number;
  credit_repaid: number;
}

export interface DashboardTotals extends Balances {
  customers: number;
  active_customers: number;
  transactions: number;
  transactions_30d: number;
  last_activity: string | null;
}
