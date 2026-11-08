// Edition gating for the API. A Basic deployment must not serve a Classic-only
// report even if someone calls the endpoint directly.
import type { MiddlewareHandler } from "npm:hono@4.6.14";
import { hasCap, type Cap } from "./domain/editions.ts";
import { fail, type Env } from "./http.ts";
import { currentEdition } from "./settings.ts";

export function requireCap(cap: Cap): MiddlewareHandler<Env> {
  return async (_c, next) => {
    const edition = await currentEdition();
    if (!hasCap(edition, cap)) fail(402, "This report is part of a higher package. Ask your administrator to upgrade.", "edition_required");
    await next();
  };
}
