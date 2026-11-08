"use client";
import { useEffect, useState } from "react";
import { api, getSession, setSession, type Session } from "./api";
import type { EditionCapabilities } from "../../supabase/functions/_shared/domain/editions";
import type { BusinessProfile, Edition } from "../../supabase/functions/_shared/domain/types";

export interface Me {
  session: Session;
  edition: Edition;
  capabilities: EditionCapabilities;
  business: BusinessProfile;
}

/** Resolves the signed-in user, refreshing edition, capabilities and business
 *  profile from the server so a change made in Admin shows up on the next load. */
export function useSession(): { me: Me | null; loading: boolean; error: string | null } {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const s = getSession();
    if (!s) { setLoading(false); window.location.href = "/login/"; return; }
    api<{ user: Me["session"]["user"]; edition: Edition; capabilities: EditionCapabilities; business: BusinessProfile }>("/auth/me")
      .then((r) => {
        if (!alive) return;
        const next = { ...s, user: r.user, edition: r.edition, capabilities: r.capabilities };
        setSession(next);
        setMe({ session: next, edition: r.edition, capabilities: r.capabilities, business: r.business });
      })
      .catch((e) => { if (alive) setError(e.message ?? "Could not load your account."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return { me, loading, error };
}
