"use client";
import { useState } from "react";
import { Download, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { Authed } from "@/components/Authed";
import { Card, Empty, Notice, Spinner, Upgrade } from "@/components/ui";
import { api, download } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { Edition } from "../../../supabase/functions/_shared/domain/types";

interface PreviewRow {
  row: number; customer: string; code: string; kind: string; amount: number; date: string;
  method: string; reference: string; note: string; errors: string[]; warning: string | null;
}
interface Preview {
  headers: string[]; mapping: string[]; unknown_headers: string[]; rows: PreviewRow[];
  total_rows: number; valid_rows: number; invalid_rows: number; limit: number; truncated: boolean;
}

export default function ImportPage() {
  return <Authed title="Import" wide>{(me) => <Import edition={me.edition} allowed={me.capabilities.import} />}</Authed>;
}

function Import({ edition, allowed }: { edition: Edition; allowed: boolean }) {
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; created_customers: number; skipped: number } | null>(null);

  if (!allowed) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-extrabold text-ink">Import existing records</h1>
        <Upgrade feature="Spreadsheet import" edition={edition} />
      </div>
    );
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setName(file.name);
    setCsv(await file.text());
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function doPreview() {
    setBusy(true); setError(null); setResult(null);
    try { setPreview(await api<Preview>("/import/preview", { method: "POST", body: { csv } })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function commit() {
    setBusy(true); setError(null);
    try {
      const r = await api<{ imported: number; created_customers: number; skipped: number }>("/import/commit", { method: "POST", body: { csv } });
      setResult(r); setPreview(null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-ink">Import existing records</h1>
        <p className="text-sm text-ink-mute">Bring your records in from one clean spreadsheet (CSV). Up to {formatNumber(500)} rows at a time.</p>
      </div>

      <Card title="1. Choose your file">
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-secondary cursor-pointer">
            <Upload className="h-4 w-4" /> Choose CSV file
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={pick} />
          </label>
          <button className="btn-ghost" onClick={() => download("/import/template.csv", "import-template.csv")}><Download className="h-4 w-4" /> Download the template</button>
          {name && <span className="text-sm text-ink-soft">{name}</span>}
        </div>
        <div className="mt-4 rounded-xl bg-sand-50 p-4 text-sm text-ink-soft">
          <p className="font-semibold text-ink">Columns the importer understands</p>
          <p className="mt-1">Customer (required), Type (required: savings deposit, savings withdrawal, credit issued, credit repayment), Amount (required), Date, Method, Reference, Note, Phone, Customer code.</p>
          <p className="mt-2">Dates can be written as 2026-03-31 or 31/03/2026. Amounts may include commas. Customers not on file yet are created automatically.</p>
        </div>
        {csv && <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={doPreview} disabled={busy}>{busy ? <Spinner label="" /> : null} Check the file</button></div>}
      </Card>

      {error && <Notice tone="error">{error}</Notice>}
      {result && (
        <Notice tone="success" title="Import finished">
          {formatNumber(result.imported)} transactions recorded
          {result.created_customers ? ` · ${formatNumber(result.created_customers)} new customers created` : ""}
          {result.skipped ? ` · ${formatNumber(result.skipped)} rows skipped` : ""}. Balances have been updated.
        </Notice>
      )}

      {preview && (
        <Card
          title={`2. Check the rows (${formatNumber(preview.valid_rows)} ready, ${formatNumber(preview.invalid_rows)} with problems)`}
          action={
            <button className="btn-primary" onClick={commit} disabled={busy || preview.valid_rows === 0}>
              {busy ? <Spinner label="" /> : <CheckCircle2 className="h-4 w-4" />} Import {formatNumber(preview.valid_rows)} rows
            </button>
          }
        >
          {preview.unknown_headers.length > 0 && (
            <div className="mb-4"><Notice tone="warn">These columns were ignored: {preview.unknown_headers.join(", ")}.</Notice></div>
          )}
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[52rem]">
              <thead className="sticky top-0 bg-sand-50">
                <tr>
                  <th className="th">Row</th><th className="th">Customer</th><th className="th">Type</th><th className="th text-right">Amount</th>
                  <th className="th">Date</th><th className="th">Method</th><th className="th">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {preview.rows.map((r) => (
                  <tr key={r.row} className={r.errors.length ? "bg-red-50/60" : r.warning ? "bg-gold-50/60" : ""}>
                    <td className="td text-ink-mute">{r.row}</td>
                    <td className="td font-semibold">{r.customer || "—"}</td>
                    <td className="td">{r.kind}</td>
                    <td className="num td">{formatNumber(r.amount)}</td>
                    <td className="td">{r.date}</td>
                    <td className="td capitalize">{r.method.replace(/_/g, " ")}</td>
                    <td className="td">
                      {r.errors.length
                        ? <span className="flex items-center gap-1 text-money-out"><AlertTriangle className="h-3.5 w-3.5" />{r.errors.join("; ")}</span>
                        : r.warning
                          ? <span className="text-gold-700">{r.warning}</span>
                          : <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />Ready</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.truncated && <p className="mt-3 text-xs text-ink-mute">Only the first {formatNumber(preview.limit)} rows are read. Split larger files into two.</p>}
        </Card>
      )}

      {!csv && (
        <Card>
          <Empty title="Nothing to import yet" hint="Download the template, fill it in, then choose the file above." />
        </Card>
      )}
    </div>
  );
}
