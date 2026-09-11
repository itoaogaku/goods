"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LEDGERS, LEDGER_CONFIG } from "@/lib/ledger";

const LEDGER_HREF: Record<string, string> = {
  acc: "/",
  trackteam: "/track-team",
};

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl gap-1 px-4 sm:px-6">
        {LEDGERS.map((ledger) => {
          const href = LEDGER_HREF[ledger];
          const active = pathname === href;
          return (
            <Link
              key={ledger}
              href={href}
              className={cn(
                "border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {LEDGER_CONFIG[ledger].shortLabel}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
