"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangeFilter, type DateRange } from "@/components/dashboard/date-range-filter";
import { cn, formatJPY, formatNumber } from "@/lib/utils";
import type {
  AnalyticsResponse,
  Ledger,
  ProductProfitability,
  RevenueBreakdownEntry,
  StockTurnoverEntry,
} from "@/lib/types";

interface AnalyticsViewProps {
  ledger: Ledger;
}

export function AnalyticsView({ ledger }: AnalyticsViewProps) {
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (dateRange.from) params.set("from", dateRange.from);
        if (dateRange.to) params.set("to", dateRange.to);
        const query = params.toString();
        const res = await fetch(`/api/${ledger}/analytics${query ? `?${query}` : ""}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "分析データの取得に失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ledger, dateRange]);

  return (
    <div className="flex flex-col gap-6">
      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {loading && <p className="text-sm text-muted-foreground">読み込み中…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BreakdownCard title="拠点別の売上構成" entries={data.revenueByLocation} />
            <BreakdownCard title="種別ごとの売上構成" entries={data.revenueByEventType} />
          </div>
          <ProductProfitabilityTable entries={data.productProfitability} />
          <StockTurnoverTable entries={data.stockTurnover} />
        </>
      )}
    </div>
  );
}

function BreakdownCard({ title, entries }: { title: string; entries: RevenueBreakdownEntry[] }) {
  const total = entries.reduce((sum, e) => sum + e.revenue, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">データがありません</p>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={entries} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    stroke="var(--muted-foreground)"
                    tickFormatter={(v: number) => `${Math.round(v / 10000)}万`}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value) => formatJPY(Number(value))}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Bar dataKey="revenue" name="売上" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>内訳</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">売上</TableHead>
                    <TableHead className="text-right">割合</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.label}>
                      <TableCell>{e.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(e.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatJPY(e.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {total > 0 ? `${((e.revenue / total) * 100).toFixed(1)}%` : "―"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProductProfitabilityTable({ entries }: { entries: ProductProfitability[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">商品別利益率ランキング</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          選択した期間に販売された商品を、利益率（利益÷売上）が高い順にランキング表示しています。利益は売上−原価（料金表一覧の原価×販売数量）です。原価が未入力の商品は利益率が出せないため、末尾に売上順でまとめています。
        </p>
        <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-10 bg-background w-12 text-right">順位</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background">商品名</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">販売数量</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">売上</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">原価合計</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">利益</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">利益率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((p, i) => (
                <TableRow key={p.productName}>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="max-w-56 truncate font-medium">{p.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.quantitySold)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatJPY(p.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p.totalCost === null ? "―" : formatJPY(p.totalCost)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-medium",
                      p.profit !== null && p.profit < 0 && "text-destructive",
                      p.profit !== null && p.profit > 0 && "text-emerald-600"
                    )}
                  >
                    {p.profit === null ? "―" : formatJPY(p.profit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {p.marginPercent === null ? "―" : `${p.marginPercent.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    この期間の販売データがありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StockTurnoverTable({ entries }: { entries: StockTurnoverEntry[] }) {
  function urgencyBadge(days: number | null) {
    if (days === null) return null;
    if (days <= 7) return <Badge variant="destructive">残り約{days}日</Badge>;
    if (days <= 30) return <Badge variant="warning">残り約{days}日</Badge>;
    return <span className="text-muted-foreground">約{formatNumber(days)}日</span>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">在庫の推移・回転率分析</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          直近90日の販売ペースをもとに、現在庫があと何日ほどで無くなりそうかの目安です（期間の絞り込みには影響されません）。売り切れが近い商品ほど上に表示されます。直近90日に販売実績が無い、または在庫が無い商品は下にまとめて表示します。
        </p>
        <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-10 bg-background">商品名</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">現在庫</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">月間販売数の目安</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">残り日数の目安</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((s) => (
                <TableRow key={s.productName}>
                  <TableCell className="max-w-56 truncate font-medium">{s.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(s.currentStock)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatNumber(s.avgMonthlySold)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.estimatedDaysRemaining === null ? "―" : urgencyBadge(s.estimatedDaysRemaining)}
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    在庫データがありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
