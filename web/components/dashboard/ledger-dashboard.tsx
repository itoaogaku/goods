"use client";

import { useEffect, useState } from "react";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { DateRangeFilter, type DateRange } from "@/components/dashboard/date-range-filter";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { ProductRanking } from "@/components/dashboard/product-ranking";
import { StockTable } from "@/components/dashboard/stock-table";
import { PendingShipmentsPanel } from "@/components/dashboard/pending-shipments-panel";
import { ExpensePanel } from "@/components/dashboard/expense-panel";
import { InventoryForms } from "@/components/dashboard/inventory-forms";
import { EventTable } from "@/components/dashboard/event-table";
import { WixSyncButton } from "@/components/dashboard/wix-sync-button";
import { DedupePanel } from "@/components/dashboard/dedupe-panel";
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
  const [dateRange, setDateRange] = useState<DateRange>({});

  useEffect(() => {
    async function loadSummary() {
      try {
        const params = new URLSearchParams();
        if (dateRange.from) params.set("from", dateRange.from);
        if (dateRange.to) params.set("to", dateRange.to);
        const query = params.toString();
        const res = await fetch(`/api/${ledger}/summary${query ? `?${query}` : ""}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSummary(await res.json());
        setError(null);
      } catch (err) {
        console.error(err);
        setError("売上サマリーの取得に失敗しました。環境変数の設定を確認してください。");
      }
    }
    void loadSummary();
  }, [ledger, refreshKey, dateRange]);

  function handleChanged() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{config.label}</h1>
          <p className="text-sm text-muted-foreground">
            2025年3月以降の販売実績・現在庫（Notion連携）
            {ledger === "acc" && "。Wixの注文は30分ごとに自動取り込みされます"}
          </p>
        </div>
        {ledger === "acc" && <WixSyncButton onSynced={handleChanged} />}
      </header>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {summary ? (
        <>
          <KpiCards kpi={summary.kpi} rangeStart={summary.rangeStart} rangeEnd={summary.rangeEnd} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SalesChart
                data={summary.monthlyStats}
                rangeStart={summary.rangeStart}
                rangeEnd={summary.rangeEnd}
              />
            </div>
            <ProductRanking data={summary.productRanking} />
          </div>
        </>
      ) : (
        !error && <p className="text-sm text-muted-foreground">読み込み中…</p>
      )}

      <PendingShipmentsPanel ledger={ledger} refreshKey={refreshKey} onChanged={handleChanged} />
      <StockTable ledger={ledger} refreshKey={refreshKey} />
      <ExpensePanel ledger={ledger} refreshKey={refreshKey} />
      {/* 顧客別集計・分析は、この台帳のサブナビ（顧客別集計／分析）に
          専用ページがあるため、ここでは重複表示しない。 */}
      {/* PurchaseOrderPanel (発注一覧) is hidden for now — see inventory-forms.tsx */}
      <InventoryForms ledger={ledger} onChanged={handleChanged} />
      <EventTable ledger={ledger} refreshKey={refreshKey} onChanged={handleChanged} />
      <DedupePanel ledger={ledger} onChanged={handleChanged} />
    </div>
  );
}
