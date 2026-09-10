"use client";

import { useEffect, useState } from "react";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { ProductRanking } from "@/components/dashboard/product-ranking";
import { SalesTable } from "@/components/dashboard/sales-table";
import type { SalesSummary } from "@/lib/types";

export default function DashboardPage() {
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sales/summary");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSummary(await res.json());
      } catch (err) {
        console.error(err);
        setError("売上サマリーの取得に失敗しました。環境変数の設定を確認してください。");
      }
    }
    void load();
  }, []);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold">グッズ販売管理ダッシュボード</h1>
        <p className="text-sm text-muted-foreground">2025年3月以降の販売実績（Notion連携）</p>
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

      <SalesTable />
    </div>
  );
}
