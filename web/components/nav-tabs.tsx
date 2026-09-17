"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LEDGERS, LEDGER_CONFIG } from "@/lib/ledger";

const LEDGER_HREF: Record<string, string> = {
  acc: "/",
  trackteam: "/track-team",
};

const EXTRA_TABS = [
  { href: "/customers", label: "顧客別集計" },
  { href: "/price-list", label: "料金表一覧" },
  { href: "/analytics", label: "分析" },
];

export function NavTabs() {
  const pathname = usePathname();

  function tabClass(active: boolean) {
    return cn(
      "border-b-2 px-3 py-3 text-sm font-medium transition-colors",
      active
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground"
    );
  }

  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl gap-1 px-4 sm:px-6">
        {LEDGERS.map((ledger) => {
          const href = LEDGER_HREF[ledger];
          return (
            <Link key={ledger} href={href} className={tabClass(pathname === href)}>
              {LEDGER_CONFIG[ledger].shortLabel}
            </Link>
          );
        })}
        {EXTRA_TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className={tabClass(pathname === tab.href)}>
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
