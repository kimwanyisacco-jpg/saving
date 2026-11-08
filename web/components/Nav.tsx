"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EditionCapabilities } from "../../supabase/functions/_shared/domain/editions";
import { LayoutDashboard, Users, ArrowLeftRight, FileBarChart, Upload, Settings, Lock } from "lucide-react";

interface Item { href: string; label: string; icon: React.ReactNode; show: boolean; locked?: boolean }

export function Nav({ caps, role }: { caps: EditionCapabilities; role: "admin" | "staff" }) {
  const path = usePathname();
  const items: Item[] = [
    { href: "/dashboard/", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, show: true },
    { href: "/customers/", label: "Customers", icon: <Users className="h-4 w-4" />, show: true },
    { href: "/transactions/", label: "Transactions", icon: <ArrowLeftRight className="h-4 w-4" />, show: true },
    { href: "/reports/", label: "Reports", icon: <FileBarChart className="h-4 w-4" />, show: true, locked: !caps.reports },
    { href: "/import/", label: "Import", icon: <Upload className="h-4 w-4" />, show: true, locked: !caps.import },
    { href: "/admin/", label: "Admin", icon: <Settings className="h-4 w-4" />, show: role === "admin" },
  ];
  return (
    <>
      {items.filter((i) => i.show).map((i) => {
        const active = path?.startsWith(i.href.replace(/\/$/, "")) ?? false;
        return (
          <Link key={i.href} href={i.href} className={`navlink ${active ? "navlink-active" : ""}`} title={i.locked ? "Not in your package" : undefined}>
            {i.icon}
            <span className="ml-1.5">{i.label}</span>
            {i.locked && <Lock className="ml-1 h-3 w-3 text-gold-600" aria-label="Not in your package" />}
          </Link>
        );
      })}
    </>
  );
}
