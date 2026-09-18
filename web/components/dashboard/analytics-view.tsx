"use client";

import { Fragment, useEffect, useState } from "react";
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
  EventType,
  Ledger,
  ProductRecoveryRate,
  RevenueBreakdownEntry,
  StockReconciliationEntry,
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
          <ProductRecoveryTable entries={data.productRecovery} />
          <StockTurnoverTable entries={data.stockTurnover} />
          {data.stockReconciliation.length > 0 && (
            <StockReconciliationTable entries={data.stockReconciliation} />
          )}
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

// 通常販売・関係者価格販売は、ユーザーの言葉に合わせて「通常価格」「関係者価格」
// と表示する。プレゼント・卸し種別（陸上部卸し/購買会卸し）はそのままの名前。
function saleCategoryLabel(eventType: EventType): string {
  if (eventType === "通常販売") return "通常価格";
  if (eventType === "関係者価格販売") return "関係者価格";
  return eventType;
}

function StockReconciliationTable({ entries }: { entries: StockReconciliationEntry[] }) {
  const locations = entries[0]?.locations.map((l) => l.location) ?? [];
  const categories = entries[0]?.locations[0]?.breakdown.map((b) => b.eventType) ?? [];
  const badCount = entries.filter((e) => e.discrepancy !== 0).length;
  // 1拠点あたりの列数: 種別ごとの内訳 + 販売数計 + 在庫数
  const colsPerLocation = categories.length + 2;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">在庫・売上確認表</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          商品ごとに、仕入れ数＋棚卸調整－（全拠点の販売数＋在庫数）が0になっているかを確認する表です（全期間の累計。期間の絞り込みには影響されません）。0でない商品は入力ミスの可能性があるため「ズレ」列に赤字で表示し、一覧の先頭にまとめています。
        </p>
        {badCount > 0 ? (
          <p className="text-sm font-medium text-destructive">{badCount}件の商品でズレが見つかりました。上の方に表示されています。</p>
        ) : (
          <p className="text-sm font-medium text-emerald-600">すべての商品でズレはありません。</p>
        )}
        {/* Table's own wrapper div (components/ui/table.tsx) also sets
            overflow-auto, which per the CSS spec makes IT a scroll container
            too regardless of whether it ever actually needs to scroll. With
            no height of its own it never does, so it just silently absorbs
            "sticky" positioning without ever moving — the header (and the
            sticky product-name column) would then scroll away instead of
            staying put. [&>div]:overflow-visible cancels that inner scroll
            container so this div (the one with a real bounded height) is
            unambiguously the one sticky positioning refers to. */}
        <div className="max-h-[70vh] overflow-auto rounded-md border border-border [&>div]:overflow-visible">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  rowSpan={2}
                  className="sticky top-0 left-0 z-20 w-32 bg-background px-2 align-bottom font-semibold text-foreground"
                >
                  商品名
                </TableHead>
                <TableHead
                  rowSpan={2}
                  className="sticky top-0 z-10 bg-background px-2 text-right align-bottom font-semibold text-foreground"
                >
                  仕入れ数
                </TableHead>
                <TableHead
                  rowSpan={2}
                  className="sticky top-0 z-10 bg-background px-2 text-right align-bottom font-semibold text-foreground"
                >
                  棚卸調整
                </TableHead>
                {locations.map((loc) => (
                  <TableHead
                    key={loc}
                    colSpan={colsPerLocation}
                    className="sticky top-0 z-10 border-l border-border bg-background px-1 text-center font-semibold text-foreground"
                  >
                    {loc}
                  </TableHead>
                ))}
                <TableHead
                  rowSpan={2}
                  className="sticky top-0 z-10 bg-background px-2 text-right align-bottom font-semibold text-foreground"
                >
                  ズレ
                </TableHead>
              </TableRow>
              <TableRow>
                {locations.map((loc) => (
                  <Fragment key={loc}>
                    {categories.map((c) => (
                      <TableHead
                        key={`${loc}-${c}`}
                        className="sticky top-10 z-10 whitespace-nowrap border-l border-border bg-background px-1.5 text-right text-xs font-semibold text-foreground"
                      >
                        {saleCategoryLabel(c)}
                      </TableHead>
                    ))}
                    <TableHead className="sticky top-10 z-10 whitespace-nowrap bg-background px-1.5 text-right text-xs font-semibold text-foreground">
                      販売数計
                    </TableHead>
                    <TableHead className="sticky top-10 z-10 whitespace-nowrap bg-background px-1.5 text-right text-xs font-semibold text-foreground">
                      在庫数
                    </TableHead>
                  </Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.productName}>
                  <TableCell className="sticky left-0 z-10 w-32 whitespace-normal break-words bg-card px-2 py-2 align-top text-xs font-medium">
                    {entry.productName}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-right text-xs tabular-nums">
                    {formatNumber(entry.purchasedQuantity)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-right text-xs tabular-nums">
                    {formatNumber(entry.adjustmentQuantity)}
                  </TableCell>
                  {entry.locations.map((loc) => (
                    <Fragment key={loc.location}>
                      {loc.breakdown.map((b) => (
                        <TableCell
                          key={`${entry.productName}-${loc.location}-${b.eventType}`}
                          className="border-l border-border px-1.5 py-1.5 text-right text-xs tabular-nums"
                        >
                          {b.quantity === 0 ? (
                            <span className="text-foreground/40">―</span>
                          ) : (
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{formatNumber(b.quantity)}</span>
                              <span className="text-foreground/70">{formatJPY(b.amount)}</span>
                            </div>
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="px-1.5 py-1.5 text-right text-xs font-medium tabular-nums">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">{formatNumber(loc.totalQuantity)}</span>
                          <span className="font-normal text-foreground/70">{formatJPY(loc.totalAmount)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-1.5 py-1.5 text-right text-xs tabular-nums">
                        {loc.stock < 0 ? <Badge variant="destructive">{formatNumber(loc.stock)}</Badge> : formatNumber(loc.stock)}
                      </TableCell>
                    </Fragment>
                  ))}
                  <TableCell className="px-2 py-2 text-right text-xs tabular-nums">
                    {entry.discrepancy !== 0 ? (
                      <Badge variant="destructive">{formatNumber(entry.discrepancy)}</Badge>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4 + colsPerLocation * locations.length} className="py-8 text-center text-muted-foreground">
                    データがありません
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

function ProductRecoveryTable({ entries }: { entries: ProductRecoveryRate[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">商品別回収率ランキング</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          商品ごとの仕入れコスト（原価×仕入れ個数）に対して、その商品の売上でどれだけ回収できているかを高い順にランキング表示しています（全期間の累計。期間の絞り込みには影響されません）。原価が未入力、またはまだ仕入れていない商品は回収率が出せないため、末尾に売上順でまとめています。
        </p>
        {/* [&>div]:overflow-visible cancels Table's own inner overflow-auto
            wrapper so this div is unambiguously what "sticky" refers to —
            see the longer comment on 在庫・売上確認表 above for why. */}
        <div className="max-h-[60vh] overflow-auto rounded-md border border-border [&>div]:overflow-visible">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 z-10 bg-background w-12 text-right">順位</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background">商品名</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">仕入れ数</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">仕入れコスト</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">販売数量</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">売上</TableHead>
                <TableHead className="sticky top-0 z-10 bg-background text-right">回収率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((p, i) => (
                <TableRow key={p.productName}>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="max-w-56 truncate font-medium">{p.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.purchasedQuantity)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p.purchaseCost === null ? "―" : formatJPY(p.purchaseCost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(p.quantitySold)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatJPY(p.revenue)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-medium",
                      p.recoveryPercent !== null && p.recoveryPercent >= 100 && "text-emerald-600"
                    )}
                  >
                    {p.recoveryPercent === null ? "―" : `${p.recoveryPercent.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    販売データがありません
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
        {/* [&>div]:overflow-visible cancels Table's own inner overflow-auto
            wrapper so this div is unambiguously what "sticky" refers to —
            see the longer comment on 在庫・売上確認表 above for why. */}
        <div className="max-h-[60vh] overflow-auto rounded-md border border-border [&>div]:overflow-visible">
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
