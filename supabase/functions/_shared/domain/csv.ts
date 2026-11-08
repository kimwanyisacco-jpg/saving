// CSV building and parsing (RFC 4180 quoting). Used by the export endpoints and
// by the Enhanced spreadsheet importer.
const needsQuote = (v: string) => /[",\r\n]/.test(v);
export const csvCell = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return needsQuote(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const toCSV = (headers: string[], rows: unknown[][]): string =>
  [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** Parses CSV text into rows of strings, honouring quotes and CRLF. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(cell); cell = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
