"use client";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Brand, Card, EditionBadge } from "@/components/ui";
import { EDITIONS, EDITION_META, FEATURES, includes } from "../../../supabase/functions/_shared/domain/editions";
import { formatUGX } from "@/lib/format";

export default function PackagesPage() {
  return (
    <div className="min-h-screen bg-sand-50">
      <header className="border-b border-sand-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Brand />
          <Link href="/login/" className="btn-primary">Sign in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-display text-3xl font-extrabold text-ink">Package comparison</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Exactly what the quotation lists, package by package. Prices are one-time development fees in Ugandan shillings.
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {EDITIONS.map((e) => (
            <Card key={e} className={EDITION_META[e].recommended ? "ring-2 ring-brand-500" : ""}>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-extrabold text-ink">{EDITION_META[e].name}</h2>
                <EditionBadge edition={e} />
              </div>
              <p className="mt-1 text-sm text-ink-soft">{EDITION_META[e].tagline}</p>
              <p className="mt-3 font-display text-2xl font-extrabold text-brand-700">{formatUGX(EDITION_META[e].price_ugx)}</p>
              <p className="text-xs text-ink-mute">delivery {EDITION_META[e].delivery_days}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem]">
              <thead>
                <tr className="border-b border-sand-200">
                  <th className="th">Feature</th>
                  {EDITIONS.map((e) => <th key={e} className="th text-center">{EDITION_META[e].name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-100">
                {FEATURES.map((f) => (
                  <tr key={f.key} className="hover:bg-sand-50">
                    <td className="td">{f.label}</td>
                    {EDITIONS.map((e) => (
                      <td key={e} className="td text-center">
                        {includes(e, f.min)
                          ? <Check className="mx-auto h-4 w-4 text-brand-600" aria-label="Included" />
                          : <Minus className="mx-auto h-4 w-4 text-sand-300" aria-label="Not included" />}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-sand-50">
                  <td className="td font-semibold">50% deposit to begin</td>
                  {EDITIONS.map((e) => <td key={e} className="num td">{formatUGX(EDITION_META[e].deposit_ugx)}</td>)}
                </tr>
                <tr className="bg-sand-50">
                  <td className="td font-semibold">30% after working demo</td>
                  {EDITIONS.map((e) => <td key={e} className="num td">{formatUGX(EDITION_META[e].demo_ugx)}</td>)}
                </tr>
                <tr className="bg-sand-50">
                  <td className="td font-semibold">20% on handover</td>
                  {EDITIONS.map((e) => <td key={e} className="num td">{formatUGX(EDITION_META[e].handover_ugx)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="mt-6" title="Scope, assumptions and exclusions">
          <div className="grid gap-6 md:grid-cols-2 text-sm text-ink-soft">
            <ul className="space-y-2">
              <li>The system is for one business and administrator account; customer self-service accounts are not included.</li>
              <li>Interest calculations, automated loan schedules, payment gateways, mobile-money processing, SMS and WhatsApp integrations are excluded.</li>
              <li>Hosting, domain registration and renewal, and paid third-party services are set up on improvement in a later version and must be agreed in writing.</li>
            </ul>
            <ul className="space-y-2">
              <li>The client supplies accurate business details, a logo (if available) and existing records to be imported.</li>
              <li>Customer balances are calculated from recorded transactions; the client reviews and confirms migrated opening balances.</li>
              <li>Source-code handover, ongoing maintenance and support beyond the package terms must be agreed in writing.</li>
            </ul>
          </div>
        </Card>

        <p className="mt-6 text-center text-sm text-ink-mute">
          Ready to look? <Link href="/" className="font-semibold text-brand-700 hover:underline">Open a live demo</Link> of any package.
        </p>
      </main>
    </div>
  );
}
