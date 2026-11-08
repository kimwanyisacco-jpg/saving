"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** Small data-fetching hook: loads on mount and exposes a manual refresh. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!path) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    api<T>(path)
      .then((r) => { if (alive) { setData(r); setError(null); } })
      .catch((e) => { if (alive) setError(e.message ?? "Could not load this page."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  return { data, loading, error, refresh };
}
