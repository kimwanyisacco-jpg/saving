// Reference numbers are issued by the system, never typed by the operator, so
// every record carries one value that can be quoted on a receipt or a
// statement. The prefix names the kind of movement; the number is the receipt
// sequence, so a reference and its receipt always agree.
import type { TxKind } from "./types.ts";

export const REFERENCE_PREFIX: Record<TxKind, string> = {
  savings_deposit: "DEP",
  savings_withdrawal: "WDR",
  credit_issued: "CRD",
  credit_repayment: "RPY",
};

/** "DEP-100158": the kind, then the receipt sequence padded to five digits. */
export function referenceFor(kind: TxKind, receipt: number): string {
  return `${REFERENCE_PREFIX[kind]}-${String(receipt).padStart(5, "0")}`;
}

/** The sequence number inside an "R-100158" or "DEP-100158" style value. */
export function receiptSequence(value: string | null | undefined): number | null {
  const m = /(\d+)\s*$/.exec(value ?? "");
  return m ? Number(m[1]) : null;
}
