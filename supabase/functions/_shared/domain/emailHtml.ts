// Branded HTML for customer emails. It mirrors the printed statement header - the
// business's own name, contact details and logo initials on the brand green - so an
// email and a statement look like they came from the same office.
//
// Table layout and inline styles only: that is what mail clients render reliably.
// A <style> block is stripped by some of them, so nothing depends on one.

const BRAND = "#125e51";
const BRAND_DARK = "#0f4a41";
const BRAND_TINT = "#eef6f3";
const INK = "#16211f";
const MUTE = "#75837f";
const LINE = "#e7e3d7";
const SAND = "#faf9f6";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Names, notes and the business name are all user input, so they are escaped
 *  before they reach the markup. A note containing markup must arrive as text. */
export const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface BrandedEmail {
  profile: { name: string; address: string; phone: string; email: string; logo_text: string };
  /** Short label in the header, e.g. "RECEIPT". */
  badge: string;
  /** Preview line a client shows beside the subject. */
  preheader: string;
  heading: string;
  intro: string;
  /** The one figure that matters, shown large: the amount or the customer number. */
  primary: { label: string; value: string };
  secondary?: { label: string; value: string };
  rows: [string, string][];
  /** The line above the small print. */
  closing: string;
}

export function brandedEmail(e: BrandedEmail): string {
  const initials = (e.profile.logo_text || e.profile.name.slice(0, 3)).toUpperCase();
  const contact = [e.profile.address, e.profile.phone].filter(Boolean).map(esc).join("  |  ");

  const detailRows = e.rows
    .map(([label, value], i) => `
              <tr>
                <td style="padding:9px 0;border-top:1px solid ${i === 0 ? LINE : "transparent"};font-family:${FONT};font-size:12px;color:${MUTE};vertical-align:top;white-space:nowrap;">${esc(label)}</td>
                <td style="padding:9px 0;border-top:1px solid ${i === 0 ? LINE : "transparent"};font-family:${FONT};font-size:13px;color:${INK};text-align:right;vertical-align:top;">${esc(value)}</td>
              </tr>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(e.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${SAND};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(e.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SAND};">
  <tr>
    <td align="center" style="padding:24px 12px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;">

        <!-- letterhead -->
        <tr>
          <td style="background:${BRAND};padding:20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="52" valign="top">
                  <div style="width:44px;height:44px;background:rgba(255,255,255,.16);border-radius:10px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-align:center;line-height:44px;letter-spacing:.5px;">${esc(initials)}</div>
                </td>
                <td valign="top" style="padding-left:14px;">
                  <div style="font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;line-height:1.3;">${esc(e.profile.name)}</div>
                  ${contact ? `<div style="font-family:${FONT};font-size:12px;color:#cfe3de;line-height:1.5;padding-top:2px;">${contact}</div>` : ""}
                  ${e.profile.email ? `<div style="font-family:${FONT};font-size:12px;color:#cfe3de;line-height:1.5;">${esc(e.profile.email)}</div>` : ""}
                </td>
                <td valign="top" align="right" style="font-family:${FONT};font-size:10px;font-weight:700;color:#cfe3de;letter-spacing:1.2px;white-space:nowrap;">${esc(e.badge)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- body -->
        <tr>
          <td style="padding:24px;">
            <h1 style="margin:0 0 14px;font-family:${FONT};font-size:18px;font-weight:700;color:${BRAND_DARK};line-height:1.35;">${esc(e.heading)}</h1>
            <p style="margin:0 0 18px;font-family:${FONT};font-size:14px;color:${INK};line-height:1.6;">${esc(e.intro)}</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND_TINT};border-radius:10px;">
              <tr>
                <td style="padding:14px 18px;">
                  <div style="font-family:${FONT};font-size:10px;font-weight:700;color:${MUTE};letter-spacing:1px;">${esc(e.primary.label).toUpperCase()}</div>
                  <div style="font-family:${FONT};font-size:23px;font-weight:700;color:${BRAND_DARK};padding-top:3px;">${esc(e.primary.value)}</div>
                </td>
                ${e.secondary ? `<td align="right" style="padding:14px 18px;">
                  <div style="font-family:${FONT};font-size:10px;font-weight:700;color:${MUTE};letter-spacing:1px;">${esc(e.secondary.label).toUpperCase()}</div>
                  <div style="font-family:${FONT};font-size:14px;color:${INK};padding-top:3px;">${esc(e.secondary.value)}</div>
                </td>` : ""}
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
              ${detailRows}
            </table>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td style="background:${SAND};border-top:1px solid ${LINE};padding:16px 24px;">
            <p style="margin:0 0 6px;font-family:${FONT};font-size:13px;font-weight:700;color:${BRAND};">${esc(e.closing)}</p>
            <p style="margin:0;font-family:${FONT};font-size:11px;color:${MUTE};line-height:1.6;">
              This message was sent automatically when a record was entered. Please report any difference at the office.<br>
              ${esc(e.profile.name)}${e.profile.phone ? ` &middot; ${esc(e.profile.phone)}` : ""}${e.profile.email ? ` &middot; ${esc(e.profile.email)}` : ""}
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}
