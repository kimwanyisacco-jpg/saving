"use client";
import type { ReactNode } from "react";
import { Shell, Spinner } from "./ui";
import { Nav } from "./Nav";
import { useSession, type Me } from "@/lib/useSession";

/** Wraps an authenticated page: loads the session, then renders the shell and nav. */
export function Authed({ title, wide = false, children }: { title: string; wide?: boolean; children: (me: Me) => ReactNode }) {
  const { me, loading, error } = useSession();
  if (loading) return <Shell user={null} title={title} publicPage><Spinner label="Loading your workspace" /></Shell>;
  if (error) return <Shell user={null} title={title} publicPage><p className="card p-6 text-sm font-semibold text-money-out">{error}</p></Shell>;
  if (!me) return null;
  return (
    <Shell
      user={me.session.user}
      title={title}
      edition={me.edition}
      wide={wide}
      nav={<Nav caps={me.capabilities} role={me.session.user.role} />}
    >
      {children(me)}
    </Shell>
  );
}
