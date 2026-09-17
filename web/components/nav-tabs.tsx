"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LEDGERS, LEDGER_CONFIG } from "@/lib/ledger";
import type { Ledger } from "@/lib/types";

// ACCの拠点間移動・在庫登録などのダッシュボード本体はこれまで通り"/"
// （陸上部は"/track-team"）に置いたまま、顧客別集計・分析はその配下の
// サブページにする。料金表一覧は両台帳で共通のデータなので、台帳の
// 切り替えとは無関係な独立タブのまま。
const LEDGER_BASE_HREF: Record<Ledger, string> = {
  acc: "",
  trackteam: "/track-team",
};

function ledgerHref(ledger: Ledger, sub: "" | "/customers" | "/analytics"): string {
  const base = LEDGER_BASE_HREF[ledger];
  return sub === "" ? base || "/" : `${base}${sub}`;
}

const SUB_TABS: { sub: "" | "/customers" | "/analytics"; label: string }[] = [
  { sub: "", label: "在庫・販売管理" },
  { sub: "/customers", label: "顧客別集計" },
  { sub: "/analytics", label: "分析" },
];

function currentLedger(pathname: string): Ledger | null {
  if (pathname === "/" || pathname === "/customers" || pathname === "/analytics") return "acc";
  if (pathname.startsWith("/track-team")) return "trackteam";
  return null;
}

export function NavTabs() {
  const pathname = usePathname();
  const ledger = currentLedger(pathname);

  function tabClass(active: boolean) {
    return cn(
      "border-b-2 px-3 py-3 text-sm font-medium transition-colors",
      active
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground"
    );
  }

  function subTabClass(active: boolean) {
    return cn(
      "rounded-full px-3 py-1 text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
    );
  }

  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl gap-1 px-4 sm:px-6">
        {LEDGERS.map((l) => (
          <Link key={l} href={LEDGER_BASE_HREF[l] || "/"} className={tabClass(ledger === l)}>
            {LEDGER_CONFIG[l].shortLabel}
          </Link>
        ))}
        <Link href="/price-list" className={tabClass(pathname === "/price-list")}>
          料金表一覧
        </Link>
      </div>
      {ledger && (
        <div className="mx-auto flex max-w-6xl gap-2 px-4 py-2 sm:px-6">
          {SUB_TABS.map((tab) => {
            const href = ledgerHref(ledger, tab.sub);
            return (
              <Link key={tab.sub} href={href} className={subTabClass(pathname === href)}>
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
