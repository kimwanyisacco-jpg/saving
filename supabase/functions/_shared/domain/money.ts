// Whole-shilling money helpers. UGX is stored as an integer number of shillings.

export const parseAmount = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
};

const grouped = (n: number) => {
  const neg = n < 0;
  const digits = Math.abs(n).toString();
  const out = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + out;
};

/** "UGX 1,234,567" */
export const formatUGX = (n: number) => "UGX " + grouped(Math.round(n || 0));
/** "1,234,567" (for table cells that already carry a currency header) */
export const formatNumber = (n: number) => grouped(Math.round(n || 0));
/** Short form for tight dashboard tiles: "1.2M", "845K". */
export const formatCompact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 10_000) return Math.round(n / 1000) + "K";
  return grouped(n);
};

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
