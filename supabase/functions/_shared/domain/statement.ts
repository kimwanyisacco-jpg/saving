// Builds the printable statement of account. Two layouts:
//   basic    - one combined table (money in / money out / net position)
//   full     - separate savings and credit sections with running balances (Classic+)
import type { BusinessProfile, Customer, Edition, Transaction } from "./types.ts";
import { Pdf, textWidth } from "./pdf.ts";
import { formatNumber, formatUGX } from "./money.ts";
import { formatDate } from "./dates.ts";
import { balances, openingBalances, sortByDate } from "./compute.ts";

export interface StatementInput {
  profile: BusinessProfile;
  customer: Pick<Customer, "code" | "name" | "phone" | "email" | "address" | "status" | "joined_on">;
  transactions: Transaction[];
  from?: string | null;
  to?: string | null;
  edition: Edition;
  generatedAt?: string;
  preparedBy?: string | null;
}

const LEFT = 40;
const BODY_RIGHT = 515;

const KIND_LABEL: Record<string, string> = {
  savings_deposit: "Savings deposit",
  savings_withdrawal: "Savings withdrawal",
  credit_issued: "Credit issued",
  credit_repayment: "Credit repayment",
};

export const statementFileName = (customer: Pick<Customer, "code" | "name">, from?: string | null, to?: string | null) => {
  const slug = customer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const range = from || to ? `-${from || "start"}-to-${to || "today"}` : "";
  return `statement-${customer.code}-${slug}${range}.pdf`;
};

export function buildStatement(input: StatementInput): Uint8Array {
  const branded = input.edition !== "basic";
  const all = input.transactions;
  const inRange = sortByDate(all.filter((t) => !t.voided_at));
  const open = input.from ? openingBalances(all, input.from) : { savings: 0, credit_outstanding: 0, savings_in: 0, savings_out: 0, credit_issued: 0, credit_repaid: 0 };
  const totals = balances(all);
  const periodLabel = input.from || input.to
    ? `${input.from ? formatDate(input.from) : "start"} to ${input.to ? formatDate(input.to) : "today"}`
    : "All transactions to date";
  const title = `Statement of account - ${input.customer.name}`;

  const render = (pageCount: number) => {
    const pdf = new Pdf(title);
    let y = pdf.cursorY;
    const page = (n: number) => `Page ${n} of ${pageCount}`;
    let pageNo = 1;

    const footer = () => {
      pdf.hr(46, 0.85);
      pdf.text(LEFT, 34, input.profile.name, 8, "regular", 0.45);
      pdf.text(LEFT, 25, `Generated ${input.generatedAt ? formatDate(input.generatedAt.slice(0, 10)) : formatDate(new Date().toISOString().slice(0, 10))}${input.preparedBy ? " by " + input.preparedBy : ""}`, 8, "regular", 0.45);
      pdf.textRight(BODY_RIGHT, 34, page(pageNo), 8, "regular", 0.45);
      pdf.textRight(BODY_RIGHT, 25, input.profile.footer_note || "", 8, "regular", 0.45);
    };
    const newPage = () => {
      footer();
      pdf.addPage();
      pageNo++;
      y = pdf.cursorY;
    };
    const need = (h: number) => { if (y - h < 70) newPage(); };

    // ---------------------------------------------------------------- header
    pdf.rect(LEFT, y - 4, 34, 34, branded ? 0.88 : 0.9);
    pdf.textCenter(LEFT + 17, y + 6, (input.profile.logo_text || input.profile.name.slice(0, 3)).toUpperCase(), 13, "bold", branded ? 0.25 : 0.4);
    pdf.text(LEFT + 44, y + 20, input.profile.name, 15, "bold");
    pdf.text(LEFT + 44, y + 8, [input.profile.address, input.profile.phone].filter(Boolean).join("  |  "), 8.5, "regular", 0.35);
    pdf.text(LEFT + 44, y - 2, input.profile.email, 8.5, "regular", 0.35);
    pdf.textRight(BODY_RIGHT, y + 20, branded ? "STATEMENT OF ACCOUNT" : "CUSTOMER STATEMENT", 12, "bold", 0.2);
    pdf.textRight(BODY_RIGHT, y + 8, periodLabel, 9, "regular", 0.35);
    pdf.textRight(BODY_RIGHT, y - 2, `Issued ${formatDate((input.generatedAt ?? new Date().toISOString()).slice(0, 10))}`, 9, "regular", 0.35);
    y -= 22;
    pdf.hr(y, 0.7);
    y -= 22;

    // ------------------------------------------------------------- customer
    pdf.text(LEFT, y, input.customer.name, 11.5, "bold");
    pdf.textRight(BODY_RIGHT, y, `Customer code: ${input.customer.code}`, 9, "regular", 0.35);
    y -= 13;
    const contact = [input.customer.phone, input.customer.email, input.customer.address].filter(Boolean).join("  |  ");
    pdf.text(LEFT, y, contact || "No contact details recorded", 8.5, "regular", 0.35);
    pdf.textRight(BODY_RIGHT, y, `Status: ${input.customer.status}   |   Joined ${formatDate(input.customer.joined_on)}`, 8.5, "regular", 0.35);
    y -= 24;

    // -------------------------------------------------------------- summary
    const tile = (x: number, w: number, label: string, value: string, strong = false) => {
      pdf.rect(x, y - 30, w, 34, strong ? 0.9 : 0.95);
      pdf.text(x + 8, y - 9, label.toUpperCase(), 7, "regular", 0.45);
      pdf.text(x + 8, y - 23, value, strong ? 11 : 10, strong ? "bold" : "regular", 0.15);
    };
    const w3 = (BODY_RIGHT - LEFT - 16) / 3;
    tile(LEFT, w3, "Savings balance", formatUGX(totals.savings), true);
    tile(LEFT + w3 + 8, w3, "Credit outstanding", formatUGX(totals.credit_outstanding), true);
    tile(LEFT + 2 * (w3 + 8), w3, "Savings in / out", `${formatNumber(totals.savings_in)} / ${formatNumber(totals.savings_out)}`);
    y -= 50;

    if (input.from) {
      pdf.text(LEFT, y, `Opening balances brought forward: savings ${formatUGX(open.savings)}, credit outstanding ${formatUGX(open.credit_outstanding)}`, 8.5, "regular", 0.3);
      y -= 18;
    }

    const rowHeight = 15;
    const tableHead = (cols: { label: string; x: number; right?: boolean; w?: number }[], label: string) => {
      need(58);
      if (label) {
        pdf.text(LEFT, y, label, 10, "bold", 0.15);
        y -= 14;
      }
      pdf.rect(LEFT, y - 5, BODY_RIGHT - LEFT, 16, 0.9);
      for (const c of cols) {
        if (c.right) pdf.textRight(c.x, y, c.label, 7.5, "bold", 0.25);
        else pdf.text(c.x, y, c.label, 7.5, "bold", 0.25);
      }
      y -= 15;
    };
    const row = (cols: { text: string; x: number; right?: boolean; bold?: boolean; gray?: number }[]) => {
      need(rowHeight + 6);
      for (const c of cols) {
        if (c.right) pdf.textRight(c.x, y, c.text, 8.5, c.bold ? "bold" : "regular", c.gray ?? 0.15);
        else pdf.text(c.x, y, c.text, 8.5, c.bold ? "bold" : "regular", c.gray ?? 0.15);
      }
      pdf.line(LEFT, y - 4.5, BODY_RIGHT, y - 4.5, 0.92, 0.4);
      y -= rowHeight;
    };

    if (!branded) {
      // ---- Basic: one combined table
      tableHead([
        { label: "DATE", x: LEFT },
        { label: "PARTICULARS", x: LEFT + 68 },
        { label: "MONEY IN", x: 355, right: true },
        { label: "MONEY OUT", x: 440, right: true },
        { label: "NET POSITION", x: BODY_RIGHT, right: true },
      ], "Account activity");
      let net = open.savings - open.credit_outstanding;
      if (input.from) row([{ text: "", x: LEFT }, { text: "Balance brought forward", x: LEFT + 68, gray: 0.35 }, { text: "", x: 355, right: true }, { text: "", x: 440, right: true }, { text: formatNumber(net), x: BODY_RIGHT, right: true, bold: true }]);
      for (const t of inRange) {
        const moneyIn = t.kind === "savings_deposit" || t.kind === "credit_repayment" ? t.amount : 0;
        const moneyOut = t.kind === "savings_withdrawal" || t.kind === "credit_issued" ? t.amount : 0;
        net += moneyIn - moneyOut;
        row([
          { text: formatDate(t.occurred_on), x: LEFT, gray: 0.3 },
          { text: KIND_LABEL[t.kind] + (t.reference ? ` (${t.reference})` : ""), x: LEFT + 68 },
          { text: moneyIn ? formatNumber(moneyIn) : "-", x: 355, right: true },
          { text: moneyOut ? formatNumber(moneyOut) : "-", x: 440, right: true },
          { text: formatNumber(net), x: BODY_RIGHT, right: true, bold: true },
        ]);
      }
      if (!inRange.length) row([{ text: "", x: LEFT }, { text: "No transactions in this period", x: LEFT + 68, gray: 0.4 }, { text: "", x: 355, right: true }, { text: "", x: 440, right: true }, { text: "", x: BODY_RIGHT, right: true }]);
      need(30);
      y -= 4;
      pdf.rect(LEFT, y - 18, BODY_RIGHT - LEFT, 22, 0.94);
      pdf.text(LEFT + 8, y - 12, "NET POSITION (savings less credit outstanding)", 9, "bold", 0.3);
      pdf.textRight(BODY_RIGHT - 8, y - 12, formatUGX(net), 11, "bold", 0.15);
      y -= 34;
    } else {
      // ---- Classic / Enhanced: savings and credit accounts side by side in one flow
      const savings = inRange.filter((t) => t.kind === "savings_deposit" || t.kind === "savings_withdrawal");
      const credit = inRange.filter((t) => t.kind === "credit_issued" || t.kind === "credit_repayment");

      tableHead([
        { label: "DATE", x: LEFT },
        { label: "PARTICULARS", x: LEFT + 68 },
        { label: "DEPOSIT", x: 355, right: true },
        { label: "WITHDRAWAL", x: 440, right: true },
        { label: "BALANCE", x: BODY_RIGHT, right: true },
      ], "Savings account");
      let sb = open.savings;
      if (input.from) row([{ text: "", x: LEFT }, { text: "Balance brought forward", x: LEFT + 68, gray: 0.35 }, { text: "", x: 355, right: true }, { text: "", x: 440, right: true }, { text: formatNumber(sb), x: BODY_RIGHT, right: true, bold: true }]);
      for (const t of savings) {
        const dep = t.kind === "savings_deposit" ? t.amount : 0;
        sb += dep || -t.amount;
        row([
          { text: formatDate(t.occurred_on), x: LEFT, gray: 0.3 },
          { text: KIND_LABEL[t.kind] + (t.method && t.method !== "cash" ? ` - ${t.method.replace(/_/g, " ")}` : ""), x: LEFT + 68 },
          { text: dep ? formatNumber(dep) : "-", x: 355, right: true },
          { text: !dep ? formatNumber(t.amount) : "-", x: 440, right: true },
          { text: formatNumber(sb), x: BODY_RIGHT, right: true, bold: true },
        ]);
      }
      if (!savings.length) row([{ text: "", x: LEFT }, { text: "No savings activity in this period", x: LEFT + 68, gray: 0.4 }, { text: "", x: 355, right: true }, { text: "", x: 440, right: true }, { text: "", x: BODY_RIGHT, right: true }]);
      need(28);
      y -= 2;
      pdf.textRight(BODY_RIGHT, y, `Closing savings balance: ${formatUGX(sb)}`, 9, "bold", 0.2);
      y -= 30;

      tableHead([
        { label: "DATE", x: LEFT },
        { label: "PARTICULARS", x: LEFT + 68 },
        { label: "CREDIT ISSUED", x: 355, right: true },
        { label: "REPAYMENT", x: 440, right: true },
        { label: "BALANCE", x: BODY_RIGHT, right: true },
      ], "Credit account");
      let cb = open.credit_outstanding;
      if (input.from) row([{ text: "", x: LEFT }, { text: "Balance brought forward", x: LEFT + 68, gray: 0.35 }, { text: "", x: 355, right: true }, { text: "", x: 440, right: true }, { text: formatNumber(cb), x: BODY_RIGHT, right: true, bold: true }]);
      for (const t of credit) {
        const issued = t.kind === "credit_issued" ? t.amount : 0;
        cb += issued || -t.amount;
        row([
          { text: formatDate(t.occurred_on), x: LEFT, gray: 0.3 },
          { text: KIND_LABEL[t.kind] + (t.method && t.method !== "cash" ? ` - ${t.method.replace(/_/g, " ")}` : ""), x: LEFT + 68 },
          { text: issued ? formatNumber(issued) : "-", x: 355, right: true },
          { text: !issued ? formatNumber(t.amount) : "-", x: 440, right: true },
          { text: formatNumber(cb), x: BODY_RIGHT, right: true, bold: true },
        ]);
      }
      if (!credit.length) row([{ text: "", x: LEFT }, { text: "No credit activity in this period", x: LEFT + 68, gray: 0.4 }, { text: "", x: 355, right: true }, { text: "", x: 440, right: true }, { text: "", x: BODY_RIGHT, right: true }]);
      need(28);
      y -= 2;
      pdf.textRight(BODY_RIGHT, y, `Outstanding credit: ${formatUGX(cb)}`, 9, "bold", 0.2);
      y -= 34;

      need(60);
      pdf.rect(LEFT, y - 34, BODY_RIGHT - LEFT, 40, 0.95);
      pdf.text(LEFT + 8, y - 10, "PERIOD TOTALS", 7.5, "bold", 0.4);
      const cols = [
        ["Savings in", formatNumber(balances(inRange).savings_in)],
        ["Savings out", formatNumber(balances(inRange).savings_out)],
        ["Credit issued", formatNumber(balances(inRange).credit_issued)],
        ["Credit repaid", formatNumber(balances(inRange).credit_repaid)],
      ];
      cols.forEach(([label, value], i) => {
        const x = LEFT + 8 + i * ((BODY_RIGHT - LEFT - 16) / 4);
        pdf.text(x, y - 24, label, 8, "regular", 0.4);
        pdf.text(x, y - 34, value, 9.5, "bold", 0.15);
      });
      y -= 52;
    }

    // ------------------------------------------------------------- sign-off
    need(70);
    pdf.text(LEFT, y, input.profile.footer_note || "Balances are calculated from recorded transactions.", 8, "regular", 0.4);
    y -= 26;
    pdf.line(LEFT, y, LEFT + 170, y, 0.6);
    pdf.line(BODY_RIGHT - 170, y, BODY_RIGHT, y, 0.6);
    pdf.text(LEFT, y - 11, "Prepared by", 8, "regular", 0.4);
    pdf.text(BODY_RIGHT - 170, y - 11, "Customer signature / date", 8, "regular", 0.4);
    footer();
    return pdf.build();
  };

  const first = render(1);
  // Second pass only to know the page count for "Page n of N".
  const pages = countPages(first);
  return pages > 1 ? render(pages) : first;
}

/** Count pages in a PDF produced by Pdf (reads /Type /Page objects, not /Pages). */
function countPages(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  const matches = text.match(/\/Type \/Page[^s]/g);
  return matches ? matches.length : 1;
}

/** Renders a statement and returns it base64-encoded (for JSON transport). */
export const buildStatementBase64 = (input: StatementInput): string => {
  const bytes = buildStatement(input);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export { textWidth };
