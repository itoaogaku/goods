"use client";

import { useEffect, useState } from "react";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { ProductRanking } from "@/components/dashboard/product-ranking";
import { StockTable } from "@/components/dashboard/stock-table";
import { InventoryForms } from "@/components/dashboard/inventory-forms";
import { EventTable } from "@/components/dashboard/event-table";
import { LEDGER_CONFIG } from "@/lib/ledger";
import type { Ledger, SalesSummary } from "@/lib/types";

interface LedgerDashboardProps {
  ledger: Ledger;
}

export function LedgerDashboard({ ledger }: LedgerDashboardProps) {
  const config = LEDGER_CONFIG[ledger];

  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function loadSummary() {
      try {
        const res = await fetch(`/api/${ledger}/summary`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSummary(await res.json());
        setError(null);
      } catch (err) {
        console.error(err);
        setError("売上サマリーの取得に失敗しました。環境変数の設定を確認してください。");
      }
    }
    void loadSummary();
  }, [ledger, refreshKey]);

  function handleChanged() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">{config.label}</h1>
        <p className="text-sm text-muted-foreground">2025年3月以降の販売実績・現在庫（Notion連携）</p>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {summary ? (
        <>
          <KpiCards kpi={summary.kpi} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SalesChart data={summary.monthlyStats} />
            </div>
            <ProductRanking data={summary.productRanking} />
          </div>
        </>
      ) : (
        !error && <p className="text-sm text-muted-foreground">読み込み中…</p>
      )}

      <StockTable ledger={ledger} refreshKey={refreshKey} />
      <InventoryForms ledger={ledger} onChanged={handleChanged} />
      <EventTable ledger={ledger} refreshKey={refreshKey} />
    </div>
  );
}
