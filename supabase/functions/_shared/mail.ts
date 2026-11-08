// Email delivery. Sending is best-effort: a customer message must never fail the
// recording of money, so every send is attempted, logged to the outbox, and any
// failure is recorded rather than thrown.
//
// Configure with:
//   RESEND_API_KEY   - API key from resend.com (the provider)
//   MAIL_FROM        - verified sender, e.g. "Kampala Community S&C <no-reply@example.com>"
// With no API key the message is stored in the outbox as `skipped`, so a demo or
// a fresh deployment shows exactly what would have gone out.
import { env } from "./env.ts";

export interface SendResult { status: "sent" | "failed" | "skipped"; provider: string; error: string | null }

export const mailConfigured = () => Boolean(env.resendApiKey && env.mailFrom);

export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  if (!mailConfigured()) return { status: "skipped", provider: "none", error: "Email is not configured (set RESEND_API_KEY and MAIL_FROM)." };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.mailFrom, to: [to], subject, text }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return { status: "failed", provider: "resend", error: `HTTP ${r.status} ${detail.slice(0, 300)}` };
    }
    return { status: "sent", provider: "resend", error: null };
  } catch (e) {
    return { status: "failed", provider: "resend", error: (e as Error).message };
  }
}
