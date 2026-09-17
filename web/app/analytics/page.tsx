"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AnalyticsView } from "@/components/dashboard/analytics-view";
import { LEDGERS, LEDGER_CONFIG } from "@/lib/ledger";
import type { Ledger } from "@/lib/types";

export default function AnalyticsPage() {
  const [ledger, setLedger] = useState<Ledger>("acc");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">分析（{LEDGER_CONFIG[ledger].shortLabel}）</h1>
          <p className="text-sm text-muted-foreground">
            商品別の利益率、拠点・種別ごとの売上構成、在庫の回転率をまとめて確認できます。
          </p>
        </div>
        <div className="flex gap-2">
          {LEDGERS.map((l) => (
            <Button
              key={l}
              type="button"
              size="sm"
              variant={ledger === l ? "default" : "outline"}
              onClick={() => setLedger(l)}
            >
              {LEDGER_CONFIG[l].shortLabel}
            </Button>
          ))}
        </div>
      </div>
      <AnalyticsView ledger={ledger} />
    </div>
  );
}
