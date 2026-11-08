// A tiny dependency-free PDF writer (PDF 1.4, base-14 fonts, Latin-1 text).
// It runs unchanged in Deno, Node and the browser, so the API can stream a
// statement and the offline demo can produce the very same file.

const A4_W = 595.28;
const A4_H = 841.89;

// Helvetica / Helvetica-Bold advance widths for ASCII 32..126 (per 1000 units).
const HELV = "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584".split(" ").map(Number);
const HELV_B = "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584".split(" ").map(Number);

export type FontName = "regular" | "bold";
export const textWidth = (s: string, size: number, font: FontName = "regular"): number => {
  const table = font === "bold" ? HELV_B : HELV;
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    w += c >= 32 && c <= 126 ? table[c - 32] : table["?".charCodeAt(0) - 32];
  }
  return (w * size) / 1000;
};

const esc = (s: string) => s.replace(/[\\()]/g, (m) => "\\" + m).replace(/[^\x20-\x7e]/g, "?");
const latin1 = (s: string) => Uint8Array.from(s, (c) => c.codePointAt(0)! & 0xff);
const num = (n: number) => (Math.round(n * 100) / 100).toString();

export class Pdf {
  private pages: string[][] = [];
  private ops: string[] = [];
  readonly width = A4_W;
  readonly height = A4_H;
  cursorY = A4_H - 56;

  readonly title: string;
  constructor(title = "Statement") {
    this.title = title;
    this.addPage();
  }

  addPage() {
    if (this.ops.length) this.pages.push(this.ops);
    this.ops = [];
    this.cursorY = A4_H - 56;
  }
  get pageCount() { return this.pages.length + 1; }

  private push(op: string) { this.ops.push(op); }

  text(x: number, y: number, s: string, size = 10, font: FontName = "regular", gray = 0) {
    if (!s) return;
    this.push(`BT /${font === "bold" ? "F2" : "F1"} ${num(size)} Tf ${num(gray)} g 1 0 0 1 ${num(x)} ${num(y)} Tm (${esc(s)}) Tj ET`);
  }
  textRight(xRight: number, y: number, s: string, size = 10, font: FontName = "regular", gray = 0) {
    this.text(xRight - textWidth(s, size, font), y, s, size, font, gray);
  }
  textCenter(xc: number, y: number, s: string, size = 10, font: FontName = "regular", gray = 0) {
    this.text(xc - textWidth(s, size, font) / 2, y, s, size, font, gray);
  }
  rect(x: number, y: number, w: number, h: number, gray = 0.92, stroke = false) {
    if (stroke) this.push(`${num(gray)} G ${num(0.7)} w ${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`);
    else this.push(`${num(gray)} g ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
  }
  line(x1: number, y1: number, x2: number, y2: number, gray = 0.75, w = 0.6) {
    this.push(`${num(gray)} G ${num(w)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }
  hr(y: number, gray = 0.8) { this.line(40, y, A4_W - 40, y, gray); }

  build(): Uint8Array {
    const bodies: string[] = [];
    const pages = this.pages.concat([this.ops]);
    // 1 catalog, 2 pages, 3 F1, 4 F2, then per page: content + page object
    const firstPageObj = 5;
    const kids = pages.map((_, i) => `${firstPageObj + i * 2 + 1} 0 R`).join(" ");
    bodies.push(`<< /Type /Catalog /Pages 2 0 R >>`);
    bodies.push(`<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`);
    bodies.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    bodies.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
    pages.forEach((ops, i) => {
      const stream = ops.join("\n");
      const pageObj = firstPageObj + i * 2 + 1;
      const parent = "2 0 R";
      bodies.push(`<< /Length ${latin1(stream).length} >>\nstream\n${stream}\nendstream`);
      bodies.push(`<< /Type /Page /Parent ${parent} /MediaBox [0 0 ${num(A4_W)} ${num(A4_H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageObj - 1} 0 R >>`);
    });

    let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const offsets: number[] = [];
    bodies.forEach((body, i) => {
      offsets.push(latin1(out).length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = latin1(out).length;
    const n = bodies.length + 1;
    out += `xref\n0 ${n}\n0000000000 65535 f \n`;
    for (const off of offsets) out += String(off).padStart(10, "0") + " 00000 n \n";
    out += `trailer\n<< /Size ${n} /Root 1 0 R /Info << /Title (${esc(this.title)}) /Producer (Credit and Savings Records Management System) >> >>\nstartxref\n${xref}\n%%EOF\n`;
    return latin1(out);
  }
}

/** Bytes -> base64 (for JSON transport of a generated PDF). */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
