// Date helpers. All business dates are plain ISO days ("YYYY-MM-DD") so a record
// never shifts because of a time zone.

export const toISODate = (d: Date | string): string =>
  typeof d === "string" ? d.slice(0, 10) : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Postgres hands timestamps back as `Date` objects, but every record type in this
 *  system declares them as strings (the JSON the browser receives is a string too).
 *  Convert here so the same value works on the server, in the demo and in the app. */
export const toISOStamp = (v: Date | string | null | undefined): string | null => {
  if (v == null) return null;
  return typeof v === "string" ? v : new Date(v.getTime()).toISOString();
};

export const today = () => toISODate(new Date());

export const addDays = (iso: string, days: number): string => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const addMonths = (iso: string, months: number): string => {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
};

export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

export const monthKey = (iso: string) => iso.slice(0, 7);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** "12 Mar 2026" */
export const formatDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]} ${y}`;
};

/** "March 2026" */
export const formatMonth = (iso: string) => {
  const [y, m] = iso.slice(0, 7).split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};

export const monthStart = (iso: string) => iso.slice(0, 7) + "-01";
export const monthEnd = (iso: string) => {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
